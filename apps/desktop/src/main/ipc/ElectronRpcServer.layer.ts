import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Queue from "effect/Queue";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import { Input, Output, ResponseExit } from "../../renderer/src/transport/ElectronRpc.model.js";
import { ElectronRpcAdmission } from "./ElectronRpcAdmission.service.js";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import type * as RpcMessage from "effect/rpc/RpcMessage";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type { Lease } from "./ElectronRpcAdmission.service.js";

/** Electron driver authenticates the document before invoking receive. */
export class ElectronRpcWire extends Context.Service<
  ElectronRpcWire,
  {
    readonly listen: (
      receive: (frame: unknown) => void,
      close: (session: string) => void
    ) => Effect.Effect<void, never, import("effect/Scope").Scope>;
    readonly account: (session: string) => Effect.Effect<string, DeliveryError>;
    readonly send: (session: string, frame: string) => Effect.Effect<void, DeliveryError>;
  }
>()("vidbee/main/ipc/ElectronRpcServer.layer/ElectronRpcWire") {}
interface RequestState {
  admission: string;
  readonly id: string | number;
  readonly lease: Lease;
  started: boolean;
  readonly tag: string;
  terminal: boolean;
}
interface ClientState {
  ended: boolean;
  readonly id: number;
  readonly local: number;
  requests: HashMap.HashMap<string | number, RequestState>;
  readonly session: string;
}
/** Main adapter exposes its forced-terminal control only to owned subscriptions. */
export const makeServerProtocol = Effect.fn("ElectronRpcServer.make")(function* ({
  encodeFailure,
  isStream,
}: {
  readonly encodeFailure: (tag: string, error: DeliveryError) => Effect.Effect<unknown, DeliveryError>;
  readonly isStream: (tag: string) => boolean;
}) {
  const wire = yield* ElectronRpcWire;
  const admissionOwner = yield* ElectronRpcAdmission;
  let documents = HashSet.empty<string>();
  const ingress = yield* Queue.bounded<unknown>(1024);
  const disconnects = yield* Queue.bounded<number>(1024);
  let clients = HashMap.empty<string, ClientState>();
  let nextId = 0;
  let requestSerial = 0;
  let executions = HashMap.empty<string, { readonly client: ClientState; readonly state: RequestState }>();
  let dead = HashSet.empty<string>();
  const key = (session: string, client: number) => `${session.length}:${session}/${client}`;
  const drop = Effect.fn("ElectronRpcServer.drop")(function* (client: ClientState) {
    const id = key(client.session, client.local);
    if (HashSet.has(dead, id)) return;
    dead = HashSet.add(dead, id);
    clients = HashMap.remove(clients, id);
    admissionOwner.disconnectClientNow({ session: client.session, client: client.local });
    for (const state of HashMap.values(client.requests))
      if (!state.started) {
        yield* state.lease.finalized;
        executions = HashMap.remove(executions, state.admission);
      }
    Queue.offerUnsafe(disconnects, client.id);
    const defect = yield* S.encodeEffect(RpcSerialization.json.codecFor(S.Defect()))(failure("TransportClosed")).pipe(
      Effect.orDie
    );
    yield* send(client, { _tag: "Defect", defect }).pipe(Effect.ignoreCause);
  });
  const send = Effect.fn("ElectronRpcServer.send")(function* (client: ClientState, message: Output["message"]) {
    const frame = yield* S.encodeEffect(S.fromJsonString(Output))({
      session: client.session,
      client: client.local,
      message,
    }).pipe(Effect.mapError(() => failure("EncodingFailed")));
    yield* wire.send(client.session, frame);
  });
  let protocolInput: (id: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void> = () => Effect.void;
  const protocol = yield* RpcServer.Protocol.make((write) =>
    Effect.gen(function* () {
      protocolInput = write;
      const drain = Effect.gen(function* () {
        while (true) {
          const raw = yield* Queue.take(ingress);
          const parsed = yield* S.decodeUnknownEffect(S.fromJsonString(Input))(raw).pipe(Effect.orDie);
          if (!HashSet.has(documents, parsed.session)) {
            const account = yield* Effect.exit(wire.account(parsed.session));
            // A frame authenticated by the driver can already be queued when its document vanishes.
            if (Exit.isFailure(account)) continue;
            const connected = yield* Effect.exit(admissionOwner.connect(parsed.session, account.value));
            if (Exit.isFailure(connected)) continue;
            documents = HashSet.add(documents, parsed.session);
          }
          const k = key(parsed.session, parsed.client);
          if (HashSet.has(dead, k)) continue;
          let client = O.getOrUndefined(HashMap.get(clients, k));
          if (client === undefined) {
            if (HashMap.size(clients) >= 1024 || nextId >= Number.MAX_SAFE_INTEGER)
              return yield* Effect.die(failure("ClientCapacity"));
            client = {
              id: nextId++,
              session: parsed.session,
              local: parsed.client,
              ended: false,
              requests: HashMap.empty(),
            };
            clients = HashMap.set(clients, k, client);
          }
          const message = parsed.message;
          if (message._tag === "Request") {
            if (
              client.ended ||
              message.isNotification === true ||
              (S.is(S.String)(message.id) && Str.startsWith("@effect/rpc/notification/")(message.id)) ||
              HashMap.has(client.requests, message.id) ||
              HashMap.size(client.requests) >= 320
            ) {
              yield* drop(client);
              continue;
            }
            const admitted = yield* Effect.exit(
              admissionOwner.admit({
                session: parsed.session,
                client: parsed.client,
                id: message.id,
                stream: isStream(message.tag),
                discard: message.discard === true,
              })
            );
            if (Exit.isFailure(admitted)) {
              yield* drop(client);
              continue;
            }
            const admission = (++requestSerial).toString();
            const state: RequestState = {
              id: message.id,
              tag: message.tag,
              terminal: false,
              started: false,
              admission,
              lease: admitted.value,
            };
            client.requests = HashMap.set(client.requests, message.id, state);
            executions = HashMap.set(executions, admission, { client, state });
          } else if (message._tag === "Eof") {
            client.ended = true;
            yield* admissionOwner.endInput(parsed.session, parsed.client);
          }
          const dispatched =
            message._tag === "Request"
              ? {
                  ...message,
                  headers: A.append(
                    A.filter(message.headers, ([name]) => name !== "x-vidbee-admission"),
                    ["x-vidbee-admission", requestSerial.toString()] satisfies [string, string]
                  ),
                }
              : message;
          yield* write(client.id, dispatched).pipe(Effect.onError(() => drop(client)));
        }
      });
      yield* Effect.forkScoped(
        drain.pipe(
          Effect.ensuring(
            Effect.suspend(() => Effect.forEach(HashMap.values(clients), drop, { concurrency: 1, discard: true }))
          )
        )
      );
      return {
        disconnects,
        send: Effect.fn("ElectronRpcServer.response")(function* (id: number, response: RpcMessage.FromServerEncoded) {
          const client = A.findFirst(HashMap.values(clients), (entry) => entry.id === id);
          if (O.isNone(client)) return;
          if (response._tag === "Chunk" || response._tag === "Exit") {
            const state = HashMap.get(client.value.requests, response.requestId);
            if (O.isNone(state) || state.value.terminal) return;
            if (response._tag === "Exit") {
              state.value.terminal = true;
              yield* state.value.lease.terminal;
            }
          }
          if (response._tag === "ClientProtocolError" || response._tag === "Request") {
            yield* drop(client.value);
            return;
          }
          yield* send(client.value, response).pipe(Effect.catchCause(() => drop(client.value)));
          if (response._tag === "Exit") {
            const state = HashMap.get(client.value.requests, response.requestId);
            if (O.isSome(state) && !state.value.started) {
              yield* state.value.lease.finalized;
              executions = HashMap.remove(executions, state.value.admission);
              client.value.requests = HashMap.remove(client.value.requests, response.requestId);
            }
          }
        }),
        end: (id: number) =>
          Effect.forEach(
            A.filter(HashMap.values(clients), (client) => client.id === id),
            drop,
            { concurrency: 1, discard: true }
          ),
        clientIds: Effect.suspend(() =>
          S.decodeEffect(S.Int.pipe(S.ReadonlySet, S.toCodecJson))(
            clients.pipe(
              HashMap.values,
              A.fromIterable,
              A.map((client) => client.id)
            )
          ).pipe(Effect.orDie)
        ),
        initialMessage: Effect.succeedNone,
        supportsAck: true,
        supportsTransferables: false,
        supportsSpanPropagation: true,
        supportsNotifications: false,
        codecFor: RpcSerialization.json.codecFor,
      };
    })
  );
  // Protocol.make owns run; install exactly one supervised ingress drain through it.
  yield* wire.listen(
    (frame) => {
      if (!Queue.offerUnsafe(ingress, frame)) Queue.failCauseUnsafe(ingress, Cause.die(failure("IngressCapacity")));
    },
    (session) => {
      admissionOwner.disconnectNow(session);
      documents = HashSet.remove(documents, session);
      for (const client of HashMap.values(clients))
        if (client.session === session) {
          clients = HashMap.remove(clients, key(session, client.local));
          Queue.offerUnsafe(disconnects, client.id);
        }
    }
  );
  const terminate = Effect.fn("ElectronRpcServer.terminate")(function* (input: {
    readonly session: string;
    readonly client: number;
    readonly requestId: string | number;
    readonly error: DeliveryError;
  }) {
    const current = HashMap.get(clients, key(input.session, input.client));
    if (O.isNone(current)) return;
    const client = current.value;
    const state = HashMap.get(client.requests, input.requestId);
    if (O.isNone(state) || state.value.terminal) return;
    state.value.terminal = true;
    yield* state.value.lease.terminal;
    const encoded = yield* encodeFailure(state.value.tag, input.error).pipe(Effect.orDie);
    const response = yield* S.decodeUnknownEffect(ResponseExit)({
      _tag: "Exit",
      requestId: input.requestId,
      exit: encoded,
    }).pipe(Effect.orDie);
    yield* send(client, { _tag: "Terminal", response }).pipe(Effect.catchCause(() => drop(client)));
    // Interrupt releases the installed server's Ack wait. Its later Exit is suppressed.
    yield* protocolInput(client.id, { _tag: "Interrupt", requestId: input.requestId });
  });
  const onRequest = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    request: { readonly headers: Readonly<Record<string, string>> }
  ): Effect.Effect<A, E, R> => {
    const entry = HashMap.get(executions, request.headers["x-vidbee-admission"] ?? "");
    if (O.isNone(entry)) return effect;
    const { client, state } = entry.value;
    state.started = true;
    return effect.pipe(
      Effect.ensuring(
        Effect.andThen(
          state.lease.finalized,
          Effect.sync(() => {
            executions = HashMap.remove(executions, state.admission);
            client.requests = HashMap.remove(client.requests, state.id);
          })
        )
      )
    );
  };
  return {
    protocol,
    terminate,
    onRequest,
    requestLease: (headers: Readonly<Record<string, string>>) =>
      Effect.suspend(() => {
        const entry = HashMap.get(executions, headers["x-vidbee-admission"] ?? "");
        return O.isSome(entry) ? Effect.succeed(entry.value.state.lease) : Effect.fail(failure("RequestClosed"));
      }),
    stats: () => ({
      clients: HashMap.size(clients),
      executions: HashMap.size(executions),
      admission: admissionOwner.stats(),
    }),
  };
});

export class ElectronRpcServer extends Context.Service<
  ElectronRpcServer,
  Effect.Success<ReturnType<typeof makeServerProtocol>>
>()("vidbee/main/ipc/ElectronRpcServer.layer/ElectronRpcServer") {}

export const layer = (options: Parameters<typeof makeServerProtocol>[0]) =>
  Layer.effect(ElectronRpcServer)(makeServerProtocol(options));

/** Mount once at bootstrap, before opening a renderer. Handler Layers are supplied by composition. */
export const mount = <Rpcs extends Rpc.Any>(group: RpcGroup.RpcGroup<Rpcs>) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const owner = yield* ElectronRpcServer;
      yield* Effect.forkScoped(
        RpcServer.make(group, { disableFatalDefects: true, onRequest: owner.onRequest }).pipe(
          Effect.provideService(RpcServer.Protocol, owner.protocol)
        )
      );
    })
  );
