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
import * as RpcClient from "effect/rpc/RpcClient";
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { ElectronRpcCapacityError, ElectronRpcTransportError, failure } from "./DocumentDelivery.errors.js";
import { Input, makeRetentionLedger, measureFrame, measureValue, Output } from "./ElectronRpc.model.js";
import type * as RpcMessage from "effect/rpc/RpcMessage";

/** Driver installs listener before connecting and owns document lifecycle cleanup. */
export class DesktopRpcConnection extends Context.Service<
  DesktopRpcConnection,
  {
    readonly onFailure?: (error: import("./DocumentDelivery.errors.js").TransportFailure) => void;
    readonly retention?: import("./ElectronRpc.model.js").RetentionAccount;
    readonly session: string;
    readonly listen: (receive: (frame: unknown) => void) => Effect.Effect<void, never, Scope.Scope>;
    readonly send: (frame: string) => Effect.Effect<void, RpcClientError>;
  }
>()("vidbee/renderer/src/transport/ElectronRpcClient.layer/DesktopRpcConnection") {}
interface Frame {
  readonly bytes: number;
  readonly lease: import("./ElectronRpc.model.js").RetentionLease;
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
const transportFailure = (reason: string) =>
  Str.endsWith("Capacity")(reason)
    ? ElectronRpcCapacityError.make({
        resource:
          reason === "FrameCapacity"
            ? "frame bytes"
            : reason === "ControlCapacity"
              ? "command entries"
              : reason === "ClientCapacity"
                ? "logical clients"
                : reason === "RequestCapacity"
                  ? "unary requests"
                  : "buffered bytes",
        scope: "logical client",
        message: reason,
      })
    : ElectronRpcTransportError.make({ operation: "transport", reason, message: reason });
const clientError = (reason: string) =>
  RpcClientError.make({ reason: RpcClientDefect.make({ message: reason, cause: transportFailure(reason) }) });
/** Per-request dispatch never blocks the physical receive drain on a client queue. */
export const makeClientProtocol = Effect.fn("ElectronRpcClient.make")(function* () {
  const scope = yield* Scope.Scope;
  const connection = yield* DesktopRpcConnection;
  const ledger = makeRetentionLedger();
  ledger.connect(connection.session, connection.session);
  const account = connection.retention ?? ledger.document(connection.session) ?? ledger.forWindow(connection.session);
  const ingress = yield* Queue.bounded<{
    readonly raw: string;
    readonly lease: import("./ElectronRpc.model.js").RetentionLease;
  }>(1024);
  interface Control {
    readonly lease?: import("./ElectronRpc.model.js").RetentionLease;
    readonly message: RpcMessage.FromServerEncoded;
  }
  interface Client {
    active: boolean;
    readonly closed: Deferred.Deferred<void>;
    readonly controls: Queue.Queue<Control>;
    readonly reserve: import("./ElectronRpc.model.js").RetentionLease;
    readonly retained: import("./ElectronRpc.model.js").RetentionLease;
    readonly write: (message: RpcMessage.FromServerEncoded) => Effect.Effect<void>;
  }
  let clients = HashMap.empty<number, Client>();
  const registered = { ids: HashSet.empty<number>() };
  let lanes = HashMap.empty<string, Lane>();
  let bytes = 0;
  let peak = 0;
  const key = (client: number, id: string | number) => `${client}/${S.is(S.String)(id) ? "s" : "n"}/${id}`;
  const releaseQueue = (lane: Lane) => {
    let item = Queue.takeUnsafe(lane.queue);
    while (item !== undefined) {
      if (Exit.isFailure(item)) break;
      bytes -= item.value.bytes;
      item.value.lease.release();
      item = Queue.takeUnsafe(lane.queue);
    }
  };
  const parts = yield* ((write: (client: number, message: RpcMessage.FromServerEncoded) => Effect.Effect<void>) =>
    Effect.gen(function* () {
      const close = Effect.fn("ElectronRpcClient.close")(function* (client: number) {
        const owner = HashMap.get(clients, client);
        if (O.isSome(owner)) {
          if (owner.value.active)
            yield* Effect.sync(() => connection.onFailure?.(transportFailure("TransportClosed"))).pipe(
              Effect.ignoreCause
            );
          owner.value.active = false;
          let command = Queue.takeUnsafe(owner.value.controls);
          while (command !== undefined && Exit.isSuccess(command)) {
            command.value.lease?.release();
            command = Queue.takeUnsafe(owner.value.controls);
          }
          owner.value.retained.release();
        }
        yield* write(client, { _tag: "ClientProtocolError", error: clientError("TransportClosed") }).pipe(
          Effect.ignoreCause
        );
        for (const [id, lane] of HashMap.toEntries(lanes)) {
          if (lane.client !== client) continue;
          lane.terminal = true;
          releaseQueue(lane);
          yield* Fiber.interrupt(lane.fiber);
          lanes = HashMap.remove(lanes, id);
          Deferred.doneUnsafe(lane.retired, Exit.void);
        }
        if (O.isSome(owner)) {
          owner.value.reserve.release();
          Deferred.doneUnsafe(owner.value.closed, Exit.void);
        }
      });
      const control = Effect.fn("ElectronRpcClient.control")(function* (
        client: number,
        controls: Queue.Queue<Control>
      ) {
        while (true) {
          const command = yield* Queue.take(controls);
          const item = { client, message: command.message };
          yield* Effect.gen(function* () {
            if (item.message._tag !== "Exit") {
              yield* write(item.client, item.message);
              yield* close(item.client);
              return;
            }
            const id = key(item.client, item.message.requestId);
            const lane = HashMap.get(lanes, id);
            if (O.isNone(lane) || lane.value.terminal) return;
            lane.value.terminal = true;
            releaseQueue(lane.value);
            // Install selected failure first; interruption cannot replace it.
            yield* write(item.client, item.message);
            yield* Fiber.interrupt(lane.value.fiber);
            lanes = HashMap.remove(lanes, id);
            Deferred.doneUnsafe(lane.value.retired, Exit.void);
          }).pipe(Effect.ensuring(Effect.sync(() => command.lease?.release())));
        }
      });
      const signal = (
        client: number,
        message: RpcMessage.FromServerEncoded,
        lease?: import("./ElectronRpc.model.js").RetentionLease
      ) => {
        const owner = HashMap.get(clients, client);
        if (O.isNone(owner)) return false;
        if (!Queue.offerUnsafe(owner.value.controls, lease === undefined ? { message } : { message, lease })) {
          Queue.failCauseUnsafe(owner.value.controls, Cause.die(failure("ControlCapacity")));
          return false;
        }
        return true;
      };
      const receive = Effect.gen(function* () {
        while (true) {
          const packet = yield* Queue.take(ingress);
          let transferred = false;
          yield* Effect.gen(function* () {
            const output = yield* S.decodeEffect(S.fromJsonString(Output))(packet.raw).pipe(Effect.orDie);
            if (output.session !== connection.session) return;
            const message = output.message;
            if (message._tag === "DocumentClosed") {
              for (const client of HashMap.keys(clients)) yield* close(client);
              return;
            }
            if (
              packet.lease.control &&
              message._tag !== "Terminal" &&
              message._tag !== "Defect" &&
              message._tag !== "Pong"
            ) {
              yield* close(output.client);
              return;
            }
            if (message._tag === "Terminal" || message._tag === "Defect") {
              transferred = signal(
                output.client,
                message._tag === "Terminal" ? message.response : message,
                packet.lease
              );
              return;
            }
            if (message._tag === "Pong") return;
            const id = key(output.client, message.requestId);
            const lane = HashMap.get(lanes, id);
            if (O.isNone(lane) || lane.value.terminal) return;
            const charge = packet.lease.bytes();
            if (
              bytes + charge > 128 * 1024 * 1024 ||
              !Queue.offerUnsafe(lane.value.queue, { message, bytes: charge, lease: packet.lease })
            ) {
              yield* close(output.client);
              return;
            }
            transferred = true;
            bytes += charge;
            peak = Math.max(peak, bytes);
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (!transferred) packet.lease.release();
              })
            )
          );
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
        run: Effect.fn("ElectronRpcClient.run")(function* (
          client: number,
          sink: (message: RpcMessage.FromServerEncoded) => Effect.Effect<void>
        ) {
          if (HashSet.has(registered.ids, client) || HashSet.size(registered.ids) >= 64)
            return yield* Effect.die(failure("ClientCapacity"));
          registered.ids = HashSet.add(registered.ids, client);
          const controls = yield* Queue.bounded<Control>(4);
          const closed = Deferred.makeUnsafe<void>();
          const reserve = account.reserve(512, true);
          const retained = account.reserve(0);
          if (reserve === undefined || retained === undefined) {
            reserve?.release();
            retained?.release();
            return yield* Effect.die(failure("ClientCapacity"));
          }
          const owner: Client = { active: true, write: sink, controls, closed, reserve, retained };
          clients = HashMap.set(clients, client, owner);
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.forkScoped(
                control(client, controls).pipe(
                  Effect.catchCause(() => close(client)),
                  Effect.ensuring(Effect.sync(() => Deferred.doneUnsafe(closed, Exit.void)))
                )
              );
              yield* Deferred.await(closed);
              return yield* Effect.interrupt;
            })
          ).pipe(
            Effect.ensuring(
              Effect.gen(function* () {
                yield* close(client).pipe(Effect.ignoreCause);
                clients = HashMap.remove(clients, client);
              })
            )
          );
        }),
        supportsAck: true,
        supportsTransferables: false,
        codecFor: RpcSerialization.json.codecFor,
        send: Effect.fn("ElectronRpcClient.send")(function* (client: number, message: RpcMessage.FromClientEncoded) {
          // RpcClient starts run in a child fiber immediately before its first send.
          if (!HashMap.has(clients, client)) yield* Effect.yieldNow;
          if (!O.exists(HashMap.get(clients, client), (owner) => owner.active))
            return yield* clientError("ClientClosed");
          if (message._tag === "Request") {
            const id = key(client, message.id);
            if (HashMap.size(lanes) >= 1280 || HashMap.has(lanes, id)) return yield* clientError("RequestCapacity");
            const queue = yield* Queue.bounded<Frame>(4);
            const retired = Deferred.makeUnsafe<void>();
            // Worker has no request-send lifetime; it belongs to the document scope.
            const worker = Effect.gen(function* () {
              while (true) {
                const item = yield* Queue.take(queue);
                const owner = HashMap.get(clients, client);
                if (O.isNone(owner) || !owner.value.retained.resize(owner.value.retained.bytes() + item.bytes)) {
                  item.lease.release();
                  bytes -= item.bytes;
                  return yield* Effect.die(failure("RetainedCapacity"));
                }
                yield* write(client, item.message).pipe(
                  Effect.ensuring(
                    Effect.sync(() => {
                      bytes -= item.bytes;
                      item.lease.release();
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
                      signal(client, { _tag: "ClientProtocolError", error: clientError("DispatchFailed") });
                  })
                )
              ),
              scope
            );
            lanes = HashMap.set(lanes, id, { id: message.id, client, queue, fiber, terminal: false, retired });
          }
          const value = { version: 1, session: connection.session, client, message } as const;
          const amount = measureValue(value);
          const serialized = amount === undefined ? undefined : account.reserve(amount, message._tag !== "Request");
          if (serialized === undefined) {
            yield* close(client);
            return yield* clientError("BufferedCapacity");
          }
          yield* Effect.gen(function* () {
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
            if (measureFrame(frame).utf8 > 64 * 1024 * 1024) {
              yield* close(client);
              return yield* clientError("FrameCapacity");
            }
            yield* connection.send(frame).pipe(Effect.onError(() => close(client)));
          }).pipe(Effect.ensuring(Effect.sync(serialized.release)));
        }),
      };
    }))((client, message) =>
    Effect.suspend(() => {
      const owner = HashMap.get(clients, client);
      return O.isSome(owner) ? owner.value.write(message) : Effect.void;
    })
  );
  const protocol: RpcClient.Protocol["Service"] = parts;
  yield* connection.listen((frame) => {
    if (!S.is(S.String)(frame) || frame.length > 64 * 1024 * 1024) {
      Queue.failCauseUnsafe(ingress, Cause.die(failure("MalformedFrame")));
      return;
    }
    const measured = measureFrame(frame);
    if (measured.utf8 > 64 * 1024 * 1024) {
      Queue.failCauseUnsafe(ingress, Cause.die(failure("FrameCapacity")));
      return;
    }
    const lease = account.reserve(measured.retained) ?? account.reserve(measured.retained, true);
    if (lease === undefined) {
      Queue.failCauseUnsafe(ingress, Cause.die(failure("BufferedCapacity")));
      return;
    }
    if (!Queue.offerUnsafe(ingress, { raw: frame, lease })) {
      lease.release();
      Queue.failCauseUnsafe(ingress, Cause.die(failure("IngressCapacity")));
    }
  });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      let packet = Queue.takeUnsafe(ingress);
      while (packet !== undefined && Exit.isSuccess(packet)) {
        packet.value.lease.release();
        packet = Queue.takeUnsafe(ingress);
      }
      ledger.disconnect(connection.session);
    })
  );
  return {
    protocol,
    retired: ({ client, requestId }: { readonly client: number; readonly requestId: string | number }) =>
      O.match(HashMap.get(lanes, key(client, requestId)), {
        onNone: () => Effect.void,
        onSome: (lane) => Deferred.await(lane.retired),
      }),
    stats: () => ({
      workers: HashMap.size(lanes),
      clients: HashMap.size(clients),
      controlBytes: HashMap.size(clients) * 512,
      bytes,
      peak,
      retained: ledger.stats(),
    }),
  };
});

export const layer = Layer.effect(RpcClient.Protocol)(makeClientProtocol().pipe(Effect.map((owner) => owner.protocol)));
