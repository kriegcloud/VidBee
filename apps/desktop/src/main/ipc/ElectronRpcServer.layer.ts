import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import {
  Input,
  makeCodecOwnership,
  measureFrame,
  measureValue,
  Output,
  ResponseExit,
} from "../../renderer/src/transport/ElectronRpc.model.js";
import { ElectronRpcAdmission } from "./ElectronRpcAdmission.service.js";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import type * as RpcMessage from "effect/rpc/RpcMessage";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type { Lease } from "./ElectronRpcAdmission.service.js";

/**
 * Electron driver authenticates the document before invoking receive.
 *
 * **Example** (Use ElectronRpcWire at its owning boundary)
 *
 * ```ts
 * import { ElectronRpcWire } from "./ElectronRpcServer.layer.js"
 * import * as Effect from "effect/Effect"
 * const access = ElectronRpcWire.use(Effect.succeed);
 * void access;
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class ElectronRpcWire extends Context.Service<
  ElectronRpcWire,
  {
    readonly listen: (
      receive: (frame: unknown, session: string, account: string) => void,
      close: (session: string) => void
    ) => Effect.Effect<void, never, import("effect/Scope").Scope>;
    readonly authorize: (session: string, tag: string) => Effect.Effect<boolean>;
    readonly account: (session: string) => Effect.Effect<string, DeliveryError>;
    readonly send: (session: string, frame: string) => Effect.Effect<void, DeliveryError>;
  }
>()("vidbee/main/ipc/ElectronRpcServer.layer/ElectronRpcWire") {}
interface Ingress {
  readonly lease: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease;
  readonly raw: string | null;
  readonly session: string;
}
interface RequestState {
  admission: string;
  readonly id: string | number;
  readonly lease: Lease;
  readonly retained: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease;
  started: boolean;
  subscription?: {
    readonly registered: import("../../renderer/src/transport/DocumentDelivery.model.js").Registered;
    readonly close: Effect.Effect<void>;
  };
  readonly tag: string;
  terminal: boolean;
}
interface Command {
  readonly done?: Deferred.Deferred<void>;
  readonly error: DeliveryError;
  readonly requestId: string | number;
}
interface ClientState {
  closed: boolean;
  readonly controlLease: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease;
  readonly controls: Queue.Queue<Command>;
  ended: boolean;
  readonly id: number;
  readonly local: number;
  readonly outbound: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease;
  requests: HashMap.HashMap<string | number, RequestState>;
  readonly session: string;
  storage: HashMap.HashMap<number, import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease>;
}
/**
 * Main adapter exposes its forced-terminal control only to owned subscriptions.
 *
 * **Example** (Use makeServerProtocol at its owning boundary)
 *
 * ```ts
 * import { makeServerProtocol } from "./ElectronRpcServer.layer.js"
 * import * as Effect from "effect/Effect"
 * const acquire = makeServerProtocol({ isStream: () => false, encodeFailure: () => Effect.succeed({ _tag: "Success", value: null }) });
 * void Effect.scoped(acquire);
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeServerProtocol = Effect.fn("ElectronRpcServer.make")(function* ({
  encodeFailure,
  isStream,
}: {
  readonly encodeFailure: (tag: string, error: DeliveryError) => Effect.Effect<unknown, DeliveryError>;
  readonly isStream: (tag: string) => boolean;
}) {
  const wire = yield* ElectronRpcWire;
  const admissionOwner = yield* ElectronRpcAdmission;
  const scope = yield* Scope.Scope;
  let codecAccounts = HashMap.empty<
    number,
    import("../../renderer/src/transport/ElectronRpc.model.js").RetentionAccount
  >();
  let decodeTargets = HashMap.empty<
    number,
    import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease
  >();
  let codecClients = HashMap.empty<number, ClientState>();
  const codecs = makeCodecOwnership({
    refused: () => {
      const client = O.getOrUndefined(HashMap.get(codecClients, Fiber.getCurrent()?.id ?? -1));
      if (client !== undefined) Queue.failCauseUnsafe(client.controls, Cause.die(failure("CodecCapacity")));
    },
    decoded: (_value, lease) => {
      const target = O.getOrUndefined(HashMap.get(decodeTargets, Fiber.getCurrent()?.id ?? -1));
      if (target === undefined) return false;
      if (!target.resize(target.bytes() + lease.bytes()))
        return Result.getOrThrowWith(Result.fail(failure("BufferedCapacity")), (error) => error);
      lease.release();
      return true;
    },
    account: () => O.getOrUndefined(HashMap.get(codecAccounts, Fiber.getCurrent()?.id ?? -1)),
  });
  const withCodecs = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    session: string,
    target?: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease,
    client?: ClientState
  ) =>
    Effect.withFiber((fiber) => {
      if (client !== undefined) codecClients = HashMap.set(codecClients, fiber.id, client);
      const account = admissionOwner.ledger.document(session);
      if (target !== undefined) decodeTargets = HashMap.set(decodeTargets, fiber.id, target);
      if (account !== undefined) codecAccounts = HashMap.set(codecAccounts, fiber.id, account);
      return effect.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            codecs.release();
            codecAccounts = HashMap.remove(codecAccounts, fiber.id);
            decodeTargets = HashMap.remove(decodeTargets, fiber.id);
            codecClients = HashMap.remove(codecClients, fiber.id);
          })
        )
      );
    });
  const ready = Deferred.makeUnsafe<(id: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>>();
  let documents = HashMap.empty<string, Queue.Queue<Ingress>>();
  const ingress = yield* Queue.bounded<Ingress>(1024);
  const disconnects = yield* Queue.bounded<number>(1024);
  let clients = HashMap.empty<string, ClientState>();
  let nextId = 0;
  let requestSerial = 0;
  let storageSerial = 0;
  let completedFrames = 0;
  let executions = HashMap.empty<string, { readonly client: ClientState; readonly state: RequestState }>();
  let dead = HashMap.empty<string, HashSet.HashSet<number>>();
  let closedDocuments = HashSet.empty<string>();
  let closingDocuments = HashSet.empty<string>();
  let closePhysical: (session: string) => Effect.Effect<void> = () => Effect.void;
  const key = (session: string, client: number) => `${session.length}:${session}/${client}`;
  const drop = Effect.fn("ElectronRpcServer.drop")(function* (client: ClientState) {
    const id = key(client.session, client.local);
    if (client.closed) return;
    client.closed = true;
    client.controlLease.release();
    client.outbound.release();
    for (const retained of HashMap.values(client.storage)) retained.release();
    client.storage = HashMap.empty();
    const history = O.getOrElse(HashMap.get(dead, client.session), HashSet.empty<number>);
    dead = HashMap.set(dead, client.session, HashSet.add(history, client.local));
    let command = Queue.takeUnsafe(client.controls);
    while (command !== undefined && Exit.isSuccess(command)) {
      if (Exit.isSuccess(command) && command.value.done !== undefined)
        Deferred.doneUnsafe(command.value.done, Exit.void);
      command = Queue.takeUnsafe(client.controls);
    }
    Queue.failCauseUnsafe(client.controls, Cause.die(failure("ClientClosed")));
    clients = HashMap.remove(clients, id);
    admissionOwner.disconnectClientNow({ session: client.session, client: client.local });
    for (const state of HashMap.values(client.requests))
      if (!state.started) {
        yield* state.lease.finalized;
        state.retained.release();
        executions = HashMap.remove(executions, state.admission);
      }
    Queue.offerUnsafe(disconnects, client.id);
    const defect = yield* S.encodeEffect(RpcSerialization.json.codecFor(S.Defect({ includeStack: true })))(
      failure("TransportClosed")
    ).pipe(Effect.orDie);
    yield* send(client, { _tag: "Defect", defect }).pipe(Effect.ignoreCause);
  });
  const send = Effect.fn("ElectronRpcServer.send")(function* (
    client: Pick<ClientState, "session" | "local"> & { storage?: ClientState["storage"] },
    message: Output["message"]
  ) {
    const storageId = message._tag === "Chunk" || message._tag === "Exit" ? ++storageSerial : undefined;
    const value = {
      version: 1,
      session: client.session,
      client: client.local,
      message,
      ...(storageId === undefined ? {} : { storageId }),
    } as const;
    const amount = measureValue(value);
    const control =
      message._tag === "Terminal" ||
      message._tag === "Defect" ||
      message._tag === "Pong" ||
      message._tag === "DocumentClosed";
    const retained =
      amount === undefined ? undefined : admissionOwner.ledger.document(client.session)?.reserve(amount, control);
    if (retained === undefined) return yield* failure("BufferedCapacity");
    yield* Effect.gen(function* () {
      const frame = yield* S.encodeEffect(S.fromJsonString(Output))(value).pipe(
        Effect.mapError(() => failure("EncodingFailed"))
      );
      if (measureFrame(frame).utf8 > admissionOwner.bounds.frameBytes) return yield* failure("FrameCapacity");
      if (storageId !== undefined && client.storage !== undefined) {
        if (HashMap.size(client.storage) >= 4096) return yield* failure("BufferedCapacity");
        client.storage = HashMap.set(client.storage, storageId, retained);
      }
      yield* wire.send(client.session, frame).pipe(Effect.onError(() => closePhysical(client.session)));
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          codecs.release();
          if (storageId === undefined || client.storage === undefined || !HashMap.has(client.storage, storageId))
            retained.release();
        })
      )
    );
  });
  const reject = Effect.fn("ElectronRpcServer.reject")(function* (session: string, local: number) {
    const history = O.getOrElse(HashMap.get(dead, session), HashSet.empty<number>);
    const live = A.filter(HashMap.values(clients), (entry) => entry.session === session).length;
    if (live + HashSet.size(history) >= 64) return yield* Effect.die(failure("ClientCapacity"));
    dead = HashMap.set(dead, session, HashSet.add(history, local));
    const defect = yield* S.encodeEffect(RpcSerialization.json.codecFor(S.Defect({ includeStack: true })))(
      failure("TransportClosed")
    ).pipe(Effect.orDie);
    yield* send({ session, local }, { _tag: "Defect", defect }).pipe(Effect.ignoreCause);
  });
  let protocolInput: (id: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void> = () => Effect.void;
  const parts = yield* ((write: (id: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>) =>
    Effect.gen(function* () {
      protocolInput = write;
      const closeDocument = Effect.fn("ElectronRpcServer.closeDocument")(function* (session: string) {
        if (HashSet.has(closingDocuments, session)) return;
        closingDocuments = HashSet.add(closingDocuments, session);
        const queue = HashMap.get(documents, session);
        documents = HashMap.remove(documents, session);
        const live = yield* Effect.exit(wire.account(session));
        closedDocuments = Exit.isSuccess(live)
          ? HashSet.add(closedDocuments, session)
          : HashSet.remove(closedDocuments, session);
        if (O.isSome(queue)) {
          let packet = Queue.takeUnsafe(queue.value);
          while (packet !== undefined && Exit.isSuccess(packet)) {
            packet.value.lease.release();
            packet = Queue.takeUnsafe(queue.value);
          }
          Queue.failCauseUnsafe(queue.value, Cause.die(failure("DocumentClosed")));
        }
        for (const client of HashMap.values(clients)) if (client.session === session) yield* drop(client);
        yield* send({ session, local: 0 }, { _tag: "DocumentClosed" }).pipe(Effect.ignoreCause);
        admissionOwner.disconnectNow(session);
        dead = HashMap.remove(dead, session);
        closingDocuments = HashSet.remove(closingDocuments, session);
      });
      closePhysical = closeDocument;
      const drainDocument = Effect.fn("ElectronRpcServer.document")(
        function* (queue: Queue.Queue<Ingress>, session: string) {
          while (true) {
            const packet = yield* Queue.take(queue);
            const decoded = yield* Effect.exit(S.decodeUnknownEffect(S.fromJsonString(Input))(packet.raw));
            if (Exit.isFailure(decoded) || decoded.value.session !== session) {
              packet.lease.release();
              return yield* Effect.die(failure("MalformedFrame"));
            }
            const parsed = decoded.value;
            let transferred = false;
            yield* Effect.gen(function* () {
              const k = key(parsed.session, parsed.client);
              const history = O.getOrElse(HashMap.get(dead, parsed.session), HashSet.empty<number>);
              if (HashSet.has(history, parsed.client)) return;
              let client = O.getOrUndefined(HashMap.get(clients, k));
              if (parsed.message._tag === "StorageReleased") {
                if (client !== undefined) {
                  const storageId = parsed.message.storageId;
                  const retained = HashMap.get(client.storage, storageId);
                  if (O.isSome(retained)) retained.value.release();
                  client.storage = HashMap.remove(client.storage, storageId);
                }
                return;
              }
              if (client === undefined && parsed.message._tag !== "Request") return;
              const message = parsed.message;
              if (packet.lease.control && message._tag === "Request") {
                if (client !== undefined) yield* drop(client);
                else yield* reject(session, parsed.client);
                return;
              }
              if (message._tag === "Request") {
                if (!(yield* wire.authorize(session, message.tag))) {
                  if (client !== undefined) yield* drop(client);
                  else yield* reject(session, parsed.client);
                  return;
                }
                if (requestSerial >= Number.MAX_SAFE_INTEGER) {
                  if (client !== undefined) yield* drop(client);
                  else yield* reject(session, parsed.client);
                  return;
                }
                if (
                  client?.ended === true ||
                  message.isNotification === true ||
                  (S.is(S.String)(message.id) && Str.startsWith("@effect/rpc/notification/")(message.id)) ||
                  (client !== undefined && HashMap.has(client.requests, message.id)) ||
                  (client !== undefined && HashMap.size(client.requests) >= 320)
                ) {
                  if (client !== undefined) yield* drop(client);
                  else yield* reject(session, parsed.client);
                  return;
                }
                if (
                  client === undefined &&
                  A.filter(HashMap.values(clients), (entry) => entry.session === session).length +
                    HashSet.size(history) >=
                    64
                )
                  return yield* Effect.die(failure("ClientCapacity"));
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
                  if (client !== undefined) yield* drop(client);
                  else yield* reject(session, parsed.client);
                  return;
                }
                if (client === undefined) {
                  // A control message never creates a protocol client or a retained history entry.
                  if (parsed.message._tag !== "Request") return;
                  const live = A.filter(HashMap.values(clients), (entry) => entry.session === session).length;
                  if (live + HashSet.size(history) >= 64 || nextId >= Number.MAX_SAFE_INTEGER)
                    return yield* Effect.die(failure("ClientCapacity"));
                  const controlLease = admissionOwner.ledger.document(session)?.reserve(512, true);
                  if (controlLease === undefined) {
                    yield* admitted.value.finalized;
                    yield* admitted.value.terminal;
                    return yield* Effect.die(failure("ControlCapacity"));
                  }
                  const outbound = admissionOwner.ledger.document(session)?.reserve(0);
                  if (outbound === undefined) {
                    controlLease.release();
                    yield* admitted.value.finalized;
                    yield* admitted.value.terminal;
                    return yield* Effect.die(failure("BufferedCapacity"));
                  }
                  const controls = yield* Queue.bounded<Command>(4);
                  client = {
                    closed: false,
                    controls,
                    controlLease,
                    outbound,
                    storage: HashMap.empty(),
                    id: nextId++,
                    session: parsed.session,
                    local: parsed.client,
                    ended: false,
                    requests: HashMap.empty(),
                  };
                  clients = HashMap.set(clients, k, client);
                  const current = client;
                  yield* Effect.forkIn(
                    Effect.gen(function* () {
                      while (true) {
                        const command = yield* Queue.take(controls);
                        yield* force(current, command).pipe(
                          Effect.ensuring(
                            Effect.sync(() => {
                              if (command.done !== undefined) Deferred.doneUnsafe(command.done, Exit.void);
                            })
                          )
                        );
                      }
                    }).pipe(Effect.catchCause(() => drop(current))),
                    scope
                  );
                }
                const admission = (++requestSerial).toString();
                const state: RequestState = {
                  retained: packet.lease,
                  id: message.id,
                  tag: message.tag,
                  terminal: false,
                  started: false,
                  admission,
                  lease: admitted.value,
                };
                transferred = true;
                client.requests = HashMap.set(client.requests, message.id, state);
                executions = HashMap.set(executions, admission, { client, state });
              } else if (message._tag === "Eof" && client !== undefined) {
                client.ended = true;
                yield* admissionOwner.endInput(parsed.session, parsed.client);
              }
              const dispatched =
                message._tag === "Request"
                  ? {
                      ...message,
                      headers: A.append(
                        A.filter(message.headers, ([name]) => Str.toLowerCase(name) !== "x-vidbee-admission"),
                        ["x-vidbee-admission", requestSerial.toString()] satisfies [string, string]
                      ),
                    }
                  : message;
              if (client === undefined) return;
              const selected = client;
              yield* withCodecs(
                Effect.suspend(() => write(selected.id, dispatched)),
                selected.session,
                packet.lease,
                selected
              ).pipe(Effect.onError(() => drop(selected)));
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  if (!transferred) packet.lease.release();
                  completedFrames = Math.min(Number.MAX_SAFE_INTEGER, completedFrames + 1);
                })
              )
            );
            yield* Effect.yieldNow;
          }
        },
        (effect, _, session) => effect.pipe(Effect.ensuring(closeDocument(session)))
      );
      const drain = Effect.gen(function* () {
        const write = yield* Deferred.await(ready);
        protocolInput = write;
        while (true) {
          const packet = yield* Queue.take(ingress);
          if (HashSet.has(closedDocuments, packet.session)) {
            packet.lease.release();
            continue;
          }
          let queue = O.getOrUndefined(HashMap.get(documents, packet.session));
          if (queue === undefined) {
            const account = yield* Effect.exit(wire.account(packet.session));
            if (Exit.isFailure(account)) {
              packet.lease.release();
              continue;
            }
            queue = yield* Queue.bounded<Ingress>(64);
            documents = HashMap.set(documents, packet.session, queue);
            yield* Effect.forkIn(drainDocument(queue, packet.session).pipe(Effect.ignoreCause), scope);
          }
          if (!Queue.offerUnsafe(queue, packet)) {
            packet.lease.release();
            yield* closeDocument(packet.session);
          }
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
              state.value.retained.release();
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
        codecFor: codecs.codecFor,
      };
    }))((id, message) => Effect.suspend(() => protocolInput(id, message)));
  const protocol: RpcServer.Protocol["Service"] = {
    ...parts,
    run: Effect.fn("ElectronRpcServer.run")(function* (write) {
      if (!Deferred.doneUnsafe(ready, Exit.succeed(write))) return yield* Effect.die(failure("AlreadyMounted"));
      return yield* Effect.never;
    }),
  };
  // Authentication precedes routing. Each document has its own supervised drain.
  yield* wire.listen(
    (frame, session, account) => {
      if (HashSet.has(closedDocuments, session) || !admissionOwner.connectNow(session, account)) return;
      const budget = admissionOwner.ledger.document(session);
      const measured = S.is(S.String)(frame) ? measureFrame(frame) : undefined;
      const data =
        measured !== undefined && measured.utf8 <= admissionOwner.bounds.frameBytes
          ? budget?.reserve(measured.retained)
          : undefined;
      const lease =
        data ?? budget?.reserve(measured !== undefined && measured.retained <= 8192 ? measured.retained : 512, true);
      if (lease === undefined) {
        const queue = HashMap.get(documents, session);
        if (O.isSome(queue)) Queue.failCauseUnsafe(queue.value, Cause.die(failure("BufferedCapacity")));
        return;
      }
      const raw =
        measured !== undefined &&
        measured.utf8 <= admissionOwner.bounds.frameBytes &&
        S.is(S.String)(frame) &&
        (data !== undefined || measured.retained <= 8192)
          ? frame
          : null;
      if (!Queue.offerUnsafe(ingress, { raw, session, lease })) {
        lease.release();
        const queue = HashMap.get(documents, session);
        if (O.isSome(queue)) Queue.failCauseUnsafe(queue.value, Cause.die(failure("IngressCapacity")));
      }
    },
    (session) => {
      admissionOwner.disconnectNow(session);
      const queue = HashMap.get(documents, session);
      documents = HashMap.remove(documents, session);
      if (O.isSome(queue)) Queue.failCauseUnsafe(queue.value, Cause.die(failure("DocumentClosed")));
      dead = HashMap.remove(dead, session);
      closedDocuments = HashSet.remove(closedDocuments, session);
    }
  );
  const force = Effect.fn("ElectronRpcServer.force")(function* (client: ClientState, input: Command) {
    const state = HashMap.get(client.requests, input.requestId);
    if (client.closed || O.isNone(state) || state.value.terminal) return;
    state.value.terminal = true;
    if (state.value.subscription !== undefined) yield* state.value.subscription.close;
    yield* state.value.lease.terminal;
    const estimate = measureValue({
      reason: input.error.reason,
      message: input.error.message,
      requestId: input.requestId,
    });
    const encoding =
      estimate === undefined ? undefined : admissionOwner.ledger.document(client.session)?.reserve(estimate, true);
    if (encoding === undefined) {
      yield* drop(client);
      return;
    }
    yield* Effect.gen(function* () {
      const encoded = yield* encodeFailure(state.value.tag, input.error);
      const response = yield* S.decodeUnknownEffect(ResponseExit)({
        _tag: "Exit",
        requestId: input.requestId,
        exit: encoded,
      });
      yield* send(client, {
        _tag: "Terminal",
        response,
        ...(state.value.subscription === undefined ? {} : { subscription: state.value.subscription.registered }),
      });
      yield* protocolInput(client.id, { _tag: "Interrupt", requestId: input.requestId });
    }).pipe(
      Effect.catchCause(() => drop(client)),
      Effect.ensuring(Effect.sync(encoding.release))
    );
  });
  const submitTermination = (
    input: {
      readonly session: string;
      readonly client: number;
      readonly requestId: string | number;
      readonly error: DeliveryError;
    },
    done?: Deferred.Deferred<void>
  ) => {
    const current = HashMap.get(clients, key(input.session, input.client));
    if (O.isNone(current) || current.value.closed) return false;
    const command: Command = done === undefined ? input : { ...input, done };
    if (!Queue.offerUnsafe(current.value.controls, command)) {
      Queue.failCauseUnsafe(current.value.controls, Cause.die(failure("ControlCapacity")));
      return false;
    }
    return true;
  };
  const terminate = Effect.fn("ElectronRpcServer.terminate")(function* (
    input: Parameters<typeof submitTermination>[0]
  ) {
    const done = Deferred.makeUnsafe<void>();
    if (submitTermination(input, done)) yield* Deferred.await(done);
  });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      codecs.close();
      let packet = Queue.takeUnsafe(ingress);
      while (packet !== undefined && Exit.isSuccess(packet)) {
        packet.value.lease.release();
        packet = Queue.takeUnsafe(ingress);
      }
    })
  );
  const onRequest = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    request: { readonly headers: Readonly<Record<string, string>> }
  ): Effect.Effect<A, E, R> => {
    const entry = HashMap.get(executions, request.headers["x-vidbee-admission"] ?? "");
    if (O.isNone(entry)) return effect;
    const { client, state } = entry.value;
    state.started = true;
    return withCodecs(effect, client.session, undefined, client).pipe(
      Effect.ensuring(
        Effect.andThen(
          state.lease.finalized,
          Effect.sync(() => {
            state.retained.release();
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
    submitTermination,
    onRequest,
    ownSubscription: (
      headers: Readonly<Record<string, string>>,
      subscription: NonNullable<RequestState["subscription"]>
    ) =>
      Effect.suspend(() => {
        const entry = HashMap.get(executions, headers["x-vidbee-admission"] ?? "");
        if (
          O.isNone(entry) ||
          entry.value.state.terminal ||
          entry.value.state.subscription !== undefined ||
          subscription.registered.token.document !== entry.value.client.session
        )
          return Effect.fail(failure("RegistrationClosed"));
        entry.value.state.subscription = subscription;
        return Effect.void;
      }),
    requestLease: (headers: Readonly<Record<string, string>>) =>
      Effect.suspend(() => {
        const entry = HashMap.get(executions, headers["x-vidbee-admission"] ?? "");
        return O.isSome(entry) ? Effect.succeed(entry.value.state.lease) : Effect.fail(failure("RequestClosed"));
      }),
    stats: () => ({
      clients: HashMap.size(clients),
      completedFrames,
      executions: HashMap.size(executions),
      documents: HashMap.size(documents),
      closedClients: A.reduce(HashMap.values(dead), 0, (total, history) => total + HashSet.size(history)),
      admission: admissionOwner.stats(),
    }),
  };
});

/**
 * Supplies Electron Rpc Server through the owning application or document scope.
 *
 * **Example** (Use ElectronRpcServer at its owning boundary)
 *
 * ```ts
 * import { ElectronRpcServer } from "./ElectronRpcServer.layer.js"
 * import * as Effect from "effect/Effect"
 * const access = ElectronRpcServer.use(Effect.succeed);
 * void access;
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class ElectronRpcServer extends Context.Service<
  ElectronRpcServer,
  Effect.Success<ReturnType<typeof makeServerProtocol>>
>()("vidbee/main/ipc/ElectronRpcServer.layer/ElectronRpcServer") {}

/**
 * Constructs layer with explicit lifetime and failure ownership.
 *
 * **Example** (Use layer at its owning boundary)
 *
 * ```ts
 * import { layer } from "./ElectronRpcServer.layer.js"
 * import * as Layer from "effect/Layer"
 * const provide = (options: Parameters<typeof layer>[0]) => Layer.build(layer(options));
 * void provide;
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = (options: Parameters<typeof makeServerProtocol>[0]) =>
  Layer.effect(ElectronRpcServer)(makeServerProtocol(options));

/**
 * Mount once at bootstrap, before opening a renderer. Handler Layers are supplied by composition.
 *
 * **Example** (Use mount at its owning boundary)
 *
 * ```ts
 * import { mount } from "./ElectronRpcServer.layer.js"
 * const compose = (options: Parameters<typeof mount>[0]) => mount(options);
 * void compose;
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
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
