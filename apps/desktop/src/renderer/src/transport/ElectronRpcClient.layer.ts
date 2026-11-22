import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Queue from "effect/Queue";
import * as RpcClient from "effect/rpc/RpcClient";
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import { failure } from "./DocumentDelivery.errors.js";
import { Input, Output } from "./ElectronRpc.model.js";
import type * as RpcMessage from "effect/rpc/RpcMessage";

/** Driver installs listener before connecting and owns document lifecycle cleanup. */
export class DesktopRpcConnection extends Context.Service<
  DesktopRpcConnection,
  {
    readonly session: string;
    readonly listen: (receive: (frame: unknown) => void) => Effect.Effect<void, never, Scope.Scope>;
    readonly send: (frame: string) => Effect.Effect<void, RpcClientError>;
  }
>()("vidbee/renderer/src/transport/ElectronRpcClient.layer/DesktopRpcConnection") {}
interface Frame {
  readonly bytes: number;
  readonly message: RpcMessage.FromServerEncoded;
}
interface Lane {
  readonly client: number;
  readonly fiber: Fiber.Fiber<void>;
  readonly id: string | number;
  readonly queue: Queue.Queue<Frame>;
  readonly retired: Deferred.Deferred<void>;
  terminal: boolean;
}
const clientError = (reason: string) =>
  RpcClientError.make({ reason: RpcClientDefect.make({ message: reason, cause: failure(reason) }) });
/** Per-request dispatch never blocks the physical receive drain on a client queue. */
export const makeClientProtocol = Effect.fn("ElectronRpcClient.make")(function* () {
  const scope = yield* Scope.Scope;
  const connection = yield* DesktopRpcConnection;
  const ingress = yield* Queue.bounded<unknown>(1024);
  const controls = yield* Queue.bounded<{ readonly client: number; readonly message: RpcMessage.FromServerEncoded }>(
    64
  );
  let lanes = HashMap.empty<string, Lane>();
  let bytes = 0;
  let peak = 0;
  const key = (client: number, id: string | number) => `${client}/${S.is(S.String)(id) ? "s" : "n"}/${id}`;
  const releaseQueue = (lane: Lane) => {
    let item = Queue.takeUnsafe(lane.queue);
    while (item !== undefined) {
      if (Exit.isSuccess(item)) bytes -= item.value.bytes;
      item = Queue.takeUnsafe(lane.queue);
    }
  };
  const protocol = yield* RpcClient.Protocol.make((write) =>
    Effect.gen(function* () {
      const close = Effect.fn("ElectronRpcClient.close")(function* (client: number) {
        yield* write(client, { _tag: "ClientProtocolError", error: clientError("TransportClosed") });
        for (const [id, lane] of HashMap.toEntries(lanes)) {
          if (lane.client !== client) continue;
          lane.terminal = true;
          releaseQueue(lane);
          yield* Fiber.interrupt(lane.fiber);
          lanes = HashMap.remove(lanes, id);
          Deferred.doneUnsafe(lane.retired, Exit.void);
        }
      });
      const control = Effect.gen(function* () {
        while (true) {
          const item = yield* Queue.take(controls);
          if (item.message._tag !== "Exit") {
            yield* write(item.client, item.message);
            yield* close(item.client);
            continue;
          }
          const id = key(item.client, item.message.requestId);
          const lane = HashMap.get(lanes, id);
          if (O.isNone(lane) || lane.value.terminal) continue;
          lane.value.terminal = true;
          releaseQueue(lane.value);
          // Install selected failure first; interruption cannot replace it.
          yield* write(item.client, item.message);
          yield* Fiber.interrupt(lane.value.fiber);
          lanes = HashMap.remove(lanes, id);
          Deferred.doneUnsafe(lane.value.retired, Exit.void);
        }
      });
      yield* Effect.forkScoped(
        control.pipe(
          Effect.onError(() =>
            Effect.forEach(
              lanes.pipe(
                HashMap.values,
                A.fromIterable,
                A.map((lane) => lane.client),
                A.dedupe
              ),
              close,
              { concurrency: 1, discard: true }
            )
          )
        )
      );
      const receive = Effect.gen(function* () {
        while (true) {
          const raw = yield* Queue.take(ingress);
          const output = yield* S.decodeUnknownEffect(S.fromJsonString(Output))(raw).pipe(Effect.orDie);
          if (output.session !== connection.session) continue;
          const message = output.message;
          if (message._tag === "Terminal" || message._tag === "Defect") {
            if (
              !Queue.offerUnsafe(controls, {
                client: output.client,
                message: message._tag === "Terminal" ? message.response : message,
              })
            )
              yield* close(output.client);
            continue;
          }
          if (message._tag === "Pong") continue;
          const id = key(output.client, message.requestId);
          const lane = HashMap.get(lanes, id);
          if (O.isNone(lane) || lane.value.terminal) continue;
          const frame = yield* S.encodeEffect(S.fromJsonString(Output))(output).pipe(Effect.orDie);
          const charge = frame.length * 2 + new TextEncoder().encode(frame).byteLength;
          if (bytes + charge > 128 * 1024 * 1024 || !Queue.offerUnsafe(lane.value.queue, { message, bytes: charge })) {
            yield* close(output.client);
            continue;
          }
          bytes += charge;
          peak = Math.max(peak, bytes);
        }
      });
      yield* Effect.forkScoped(
        receive.pipe(
          Effect.ensuring(
            Effect.suspend(() =>
              Effect.forEach(
                lanes.pipe(
                  HashMap.values,
                  A.fromIterable,
                  A.map((lane) => lane.client),
                  A.dedupe
                ),
                close,
                { concurrency: 1, discard: true }
              )
            )
          )
        )
      );
      return {
        supportsAck: true,
        supportsTransferables: false,
        codecFor: RpcSerialization.json.codecFor,
        send: Effect.fn("ElectronRpcClient.send")(function* (client: number, message: RpcMessage.FromClientEncoded) {
          if (message._tag === "Request") {
            const id = key(client, message.id);
            if (HashMap.size(lanes) >= 1280 || HashMap.has(lanes, id)) return yield* clientError("RequestCapacity");
            const queue = yield* Queue.bounded<Frame>(4);
            const retired = Deferred.makeUnsafe<void>();
            // Worker has no request-send lifetime; it belongs to the document scope.
            const worker = Effect.gen(function* () {
              while (true) {
                const item = yield* Queue.take(queue);
                yield* write(client, item.message).pipe(
                  Effect.ensuring(
                    Effect.sync(() => {
                      bytes -= item.bytes;
                    })
                  )
                );
                if (item.message._tag === "Exit") {
                  lanes = HashMap.remove(lanes, id);
                  Deferred.doneUnsafe(retired, Exit.void);
                  return;
                }
              }
            });
            const fiber = yield* Effect.forkIn(
              worker.pipe(
                Effect.onError((cause) =>
                  Effect.sync(() => {
                    if (!Cause.hasInterruptsOnly(cause))
                      Queue.offerUnsafe(controls, {
                        client,
                        message: { _tag: "ClientProtocolError", error: clientError("DispatchFailed") },
                      });
                  })
                )
              ),
              scope
            );
            lanes = HashMap.set(lanes, id, { id: message.id, client, queue, fiber, terminal: false, retired });
          }
          const frame = yield* S.encodeEffect(S.fromJsonString(Input))({
            session: connection.session,
            client,
            message,
          }).pipe(
            Effect.mapError(() => clientError("EncodingFailed")),
            Effect.onError(
              Effect.fn("ElectronRpcClient.rollbackEncoding")(function* () {
                if (message._tag !== "Request") return;
                const id = key(client, message.id);
                const lane = HashMap.get(lanes, id);
                if (O.isNone(lane)) return;
                lane.value.terminal = true;
                releaseQueue(lane.value);
                yield* Fiber.interrupt(lane.value.fiber);
                lanes = HashMap.remove(lanes, id);
                Deferred.doneUnsafe(lane.value.retired, Exit.void);
              })
            )
          );
          yield* connection.send(frame).pipe(Effect.onError(() => close(client)));
        }),
      };
    })
  );
  yield* connection.listen((frame) => {
    if (!Queue.offerUnsafe(ingress, frame)) Queue.failCauseUnsafe(ingress, Cause.die(failure("IngressCapacity")));
  });
  return {
    protocol,
    retired: ({ client, requestId }: { readonly client: number; readonly requestId: string | number }) =>
      O.match(HashMap.get(lanes, key(client, requestId)), {
        onNone: () => Effect.void,
        onSome: (lane) => Deferred.await(lane.retired),
      }),
    stats: () => ({ workers: HashMap.size(lanes), bytes, peak }),
  };
});

export const layer = Layer.effect(RpcClient.Protocol)(makeClientProtocol().pipe(Effect.map((owner) => owner.protocol)));
