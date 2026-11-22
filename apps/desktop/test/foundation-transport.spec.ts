import { it } from "@effect/vitest";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Result from "effect/Result";
import * as Atom from "effect/reactivity/Atom";
import * as Registry from "effect/reactivity/AtomRegistry";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as S from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Str from "effect/String";
import { expect } from "vitest";
import { makeSubscriptions } from "../src/main/ipc/DocumentSubscriptions.service.js";
import { ElectronRpcAdmission, limits, makeAdmission } from "../src/main/ipc/ElectronRpcAdmission.service.js";
import { ElectronRpcWire, makeServerProtocol } from "../src/main/ipc/ElectronRpcServer.layer.js";
import { publishRecipient } from "../src/main/ipc/Publication.service.js";
import { makeNotifications } from "../src/main/lib/DesktopNotifications.service.js";
import { originalFailure, unwrapOriginal } from "../src/main/lib/OriginalFailure.errors.js";
import { makeOperations } from "../src/main/runtime/ApplicationOperations.layer.js";
import { makeSynchronousHost } from "../src/main/runtime/SynchronousHost.entry.js";
import { makeInvocationEntry } from "../src/renderer/src/runtime/RendererInvocation.entry.js";
import { makeRecovery } from "../src/renderer/src/runtime/StreamRecovery.atoms.js";
import { DeliveryError, failure } from "../src/renderer/src/transport/DocumentDelivery.errors.js";
import { Completion, Subscription } from "../src/renderer/src/transport/DocumentDelivery.model.js";
import { makeDeliveryGate } from "../src/renderer/src/transport/DocumentDelivery.service.js";
import { Input, Output } from "../src/renderer/src/transport/ElectronRpc.model.js";
import { DesktopRpcConnection, makeClientProtocol } from "../src/renderer/src/transport/ElectronRpcClient.layer.js";
import { census, sameObservation } from "../src/renderer/src/transport/RpcCensus.model.js";
import { RpcOptional, RpcValue } from "../src/renderer/src/transport/RpcField.model.js";
import { ObservedValue, pack } from "../src/renderer/src/transport/RpcObservation.model.js";
import { runtime } from "./TransportRuntime.entry.js";
import type { OperationHandle } from "../src/main/runtime/ApplicationOperations.service.js";

const Echo = Rpc.make("Echo", { payload: { text: S.String }, success: S.String, error: DeliveryError });
const Watch = Rpc.make("Watch", { success: S.Int, error: DeliveryError, stream: true });
const Fail = Rpc.make("Fail", { success: S.Void, error: DeliveryError });
const Defect = Rpc.make("Defect", { success: S.Void, error: DeliveryError });
const Never = Rpc.make("Never", { success: S.Int, error: DeliveryError, stream: true });
const Observe = Rpc.make("Observe", { success: Subscription(S.Int), error: DeliveryError, stream: true });
const Native = Rpc.make("Native", { success: S.Boolean, error: DeliveryError });
const Flood = Rpc.make("Flood", { success: S.Int, error: DeliveryError, stream: true });
const Rpcs = RpcGroup.make(Echo, Watch, Fail, Defect, Never, Observe, Native, Flood);
const pair = Effect.fn("Test.pair")(function* ({ holdAck = false }: { readonly holdAck?: boolean } = {}) {
  let receiveMain: (value: unknown) => void = () => {};
  let receiveRenderer: (value: unknown) => void = () => {};
  let receiveOther: (value: unknown) => void = () => {};
  let documentLive = true;
  let disconnectMain: (session: string) => void = () => {};
  let nativeCompletion: Effect.Effect<void> = Effect.void;
  const nativeStarted = yield* Deferred.make<void>();
  const nativeEnded = yield* Deferred.make<void>();
  const neverEnded = yield* Deferred.make<void>();
  const chunk = yield* Deferred.make<void>();
  const firstAck = yield* Deferred.make<void>();
  let acks = 0;
  let largestChunk = 0;
  let lastRequest: { readonly client: number; readonly requestId: string | number } = { client: 0, requestId: 0 };
  const main = yield* makeServerProtocol({
    isStream: (tag) => tag === "Watch" || tag === "Never" || tag === "Observe" || tag === "Flood",
    encodeFailure: (tag, error) => {
      const schema = tag === "Watch" || tag === "Never" ? Rpc.exitSchema(Watch) : Rpc.exitSchema(Echo);
      return S.encodeEffect(RpcSerialization.json.codecFor(schema))(error.pipe(Exit.fail)).pipe(
        Effect.mapError(() => failure("EncodeFailed"))
      );
    },
  }).pipe(
    Effect.provideService(ElectronRpcAdmission, makeAdmission()),
    Effect.provideService(ElectronRpcWire, {
      listen: (receive, close) =>
        Effect.sync(() => {
          receiveMain = receive;
          disconnectMain = close;
        }),
      account: (session) =>
        session === "other"
          ? Effect.succeed("other-window")
          : documentLive
            ? Effect.succeed("window")
            : Effect.fail(failure("Disconnected")),
      send: (_session, frame) =>
        Effect.sync(() => {
          if (_session === "other") {
            receiveOther(frame);
            return;
          }
          const parsed = S.decodeResult(S.fromJsonString(Output))(frame);
          if (Result.isSuccess(parsed) && parsed.success.message._tag === "Chunk") {
            largestChunk = Math.max(largestChunk, parsed.success.message.values.length);
            Deferred.doneUnsafe(chunk, Exit.void);
          }
          receiveRenderer(frame);
        }),
    })
  );
  const renderer = yield* makeClientProtocol().pipe(
    Effect.provideService(DesktopRpcConnection, {
      session: "document",
      listen: (receive) =>
        Effect.sync(() => {
          receiveRenderer = receive;
        }),
      send: (frame) =>
        Effect.sync(() => {
          const parsed = S.decodeResult(S.fromJsonString(Input))(frame);
          if (Result.isSuccess(parsed)) {
            if (parsed.success.message._tag === "Request")
              lastRequest = { client: parsed.success.client, requestId: parsed.success.message.id };
            if (parsed.success.message._tag === "Ack") {
              acks++;
              Deferred.doneUnsafe(firstAck, Exit.void);
            }
            if (holdAck && parsed.success.message._tag === "Ack") return;
          }
          receiveMain(frame);
        }),
    })
  );
  const handlers = Rpcs.toLayer({
    Echo: ({ text }) => Effect.succeed(text),
    Native: Effect.fn("Test.Native")(
      function* (_payload: void, options: { readonly headers: Readonly<Record<string, string>> }) {
        const lease = yield* main.requestLease(options.headers);
        const retained = yield* lease.retainNative(4096);
        nativeCompletion = retained.complete;
        yield* Deferred.succeed(nativeStarted, undefined);
        return yield* Effect.never;
      },
      Effect.ensuring(Deferred.succeed(nativeEnded, undefined))
    ),
    Watch: () => Stream.make(1, 2, 3),
    Flood: () => Stream.make(...A.range(0, 1023)),
    Observe: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const subscriptions = makeSubscriptions({
            identity: { document: "document", client: "c", generation: 0, epoch: "e" },
            onTerminal: () => {},
          });
          const sub = yield* subscriptions.acquire<number>(
            "events",
            (publish) => {
              publish(1);
              publish(2);
            },
            (value) => ({ value, bytes: 8 })
          );
          return subscriptions.watch(sub).pipe(Stream.take(3));
        })
      ),
    Never: () =>
      Stream.concat(Stream.make(1), Stream.never).pipe(Stream.ensuring(Deferred.succeed(neverEnded, undefined))),
    Fail: () => Effect.fail(failure("Expected")),
    Defect: () => Effect.die("handler defect"),
  });
  const handlerContext = yield* Layer.build(handlers);
  yield* Effect.forkScoped(
    RpcServer.make(Rpcs, { disableFatalDefects: true, onRequest: main.onRequest }).pipe(
      Effect.provideContext(handlerContext),
      Effect.provideService(RpcServer.Protocol, main.protocol)
    )
  );
  const client = yield* RpcClient.make(Rpcs).pipe(Effect.provideService(RpcClient.Protocol, renderer.protocol));
  return {
    client,
    main,
    renderer,
    firstChunk: Deferred.await(chunk),
    firstAck: Deferred.await(firstAck),
    wireStats: () => ({ acks, largestChunk }),
    nextClient: RpcClient.make(Rpcs).pipe(Effect.provideService(RpcClient.Protocol, renderer.protocol)),
    request: () => lastRequest,
    disconnectMain: () => {
      documentLive = false;
      disconnectMain("document");
    },
    nextWindow: Effect.gen(function* () {
      const other = yield* makeClientProtocol().pipe(
        Effect.provideService(DesktopRpcConnection, {
          session: "other",
          listen: (receive) =>
            Effect.sync(() => {
              receiveOther = receive;
            }),
          send: (frame) => Effect.sync(() => receiveMain(frame)),
        })
      );
      return yield* RpcClient.make(Rpcs).pipe(Effect.provideService(RpcClient.Protocol, other.protocol));
    }),
    nativeStarted: Deferred.await(nativeStarted),
    nativeEnded: Deferred.await(nativeEnded),
    neverEnded: Deferred.await(neverEnded),
    completeNative: () => nativeCompletion,
  };
});

it.effect("transport: real RpcServer/RpcClient unary Unicode, stream order, failure and defect isolation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { client } = yield* pair();
      const actual1 = yield* client.Echo({ text: "hello 🌍" });
      expect(actual1).toBe("hello 🌍");
      const actual2 = yield* Stream.runCollect(client.Watch());
      expect(actual2).toEqual([1, 2, 3]);
      const actual3 = yield* Effect.exit(client.Fail());
      expect(Exit.isFailure(actual3)).toBe(true);
      const actual4 = yield* Effect.exit(client.Defect());
      expect(Exit.isFailure(actual4)).toBe(true);
      const actual5 = yield* client.Echo({ text: "still live" });
      expect(actual5).toBe("still live");
    })
  )
);

it.effect("review3 finding 4: replacement cannot erase a successful or failed operation's original cut", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = makeSubscriptions({
        identity: { document: "d", client: "c", generation: 1, epoch: "e" },
        onTerminal: () => {},
      });
      const first = yield* owner.acquire(
        "events",
        (publish) => publish(1),
        (value) => ({ value, bytes: 8 })
      );
      const bound = yield* owner.bind([first.token]);
      const initial = yield* bound.capture;
      expect(initial[0]?.through).toBe(1);
      yield* owner.acquire(
        "events",
        () => {},
        (value) => ({ value, bytes: 8 })
      );
      const actual6 = yield* Effect.exit(bound.capture);
      expect(Exit.isFailure(actual6)).toBe(true);
      const actual7 = yield* Effect.exit(owner.requireActive(first.token));
      expect(Exit.isFailure(actual7)).toBe(true);
    })
  )
);

it.effect("review3 findings 1 and 5: observation envelopes and all teardown releases despite failure", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const releases: Array<string> = [];
      const owner = makeSubscriptions({
        identity: { document: "d", client: "c", generation: 0, epoch: "e" },
        onTerminal: () => {},
      });
      const sub = yield* owner.acquire(
        "events",
        (publish, own) => {
          own(() => {
            releases.push("A");
          });
          own(() => {
            releases.push("B");
          });
          publish(42);
        },
        (value) => ({ value, bytes: 8 })
      );
      const events = yield* Stream.runCollect(owner.watch(sub).pipe(Stream.take(2)));
      expect(events[0]?._tag).toBe("Registered");
      expect(events[1]).toEqual({ _tag: "Observation", token: sub.token, epoch: "e", sequence: 1, value: 42 });
      yield* sub.close;
      expect(releases).toEqual(["B", "A"]);
    })
  )
);

it.effect("review1 finding 1: only selected operation cuts block; ended unsatisfied cuts fail", () =>
  Effect.gen(function* () {
    const gate = makeDeliveryGate();
    const cut = {
      token: { document: "d", client: "c", generation: 0, family: "events", serial: 1 },
      epoch: "e",
      through: 1,
    };
    yield* gate.awaitCuts([]);
    gate.end(cut);
    const actual8 = yield* Effect.exit(gate.awaitCuts([cut]));
    expect(Exit.isFailure(actual8)).toBe(true);
    gate.applied(cut);
    yield* gate.awaitCuts([cut]);
  })
);

it.effect("native retention: reload and request finalization preserve charges until actual completion", () =>
  Effect.gen(function* () {
    const owner = makeAdmission({ ...limits, native: 1 });
    yield* owner.connect("first", "window");
    const lease = yield* owner.admit({ session: "first", client: 0, id: "1", stream: false, discard: false });
    const native = yield* lease.retainNative(4096);
    yield* owner.disconnect("first");
    yield* lease.finalized;
    expect(owner.stats().appBytes).toBe(4096);
    expect(owner.stats().appUnary).toBe(1);
    yield* owner.connect("second", "window");
    const second = yield* owner.admit({ session: "second", client: 0, id: 1, stream: false, discard: false });
    const actual9 = yield* Effect.exit(second.retainNative(1));
    expect(Exit.isFailure(actual9)).toBe(true);
    yield* native.complete;
    yield* native.complete;
    expect(owner.stats().appBytes).toBe(0);
    yield* second.finalized;
    yield* second.terminal;
    expect(owner.stats().appUnary).toBe(0);
  })
);

it.effect("review2 finding 4: cleanup remains independent of logical completion", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let bytes = 0;
      const owner = yield* makeOperations({
        reserve: (_origin, amount) => {
          bytes += amount;
          return true;
        },
        release: (_origin, amount) => {
          bytes -= amount;
        },
      });
      const held = yield* Deferred.make<void>();
      const handle = yield* owner.accept({
        originAccount: "window",
        reserveBytes: 20,
        run: Effect.fn("Test.run")(function* (handle: OperationHandle<string, never>) {
          yield* handle.registerCleanup(Deferred.await(held));
          yield* handle.complete(Exit.succeed("committed"));
        }, Effect.orDie),
      });
      const actual10 = yield* handle.logical;
      expect(actual10).toEqual(Exit.succeed("committed"));
      expect(bytes).toBe(276);
      yield* Deferred.succeed(held, undefined);
      yield* handle.released;
      expect(bytes).toBe(0);
      yield* owner.closeAdmission;
      const actual11 = yield* Effect.exit(
        owner.accept({ originAccount: "window", reserveBytes: 1, run: () => Effect.void })
      );
      expect(Exit.isFailure(actual11)).toBe(true);
    })
  )
);

it.effect(
  "review1 finding 8 / review2 finding 9: complete completion codec preserves presence and census detects a mutated result",
  () =>
    Effect.gen(function* () {
      const value = {
        retained: {
          absentMarker: { _tag: "RpcUndefined" },
          ownUndefined: undefined,
          minusZero: -0,
          nan: Number.NaN,
          big: 2n,
          nested: [undefined, null, Number.POSITIVE_INFINITY],
        },
      };
      yield* pack(value.retained);
      const success = S.Struct({ retained: ObservedValue });
      const completion = Completion({ success, error: DeliveryError });
      const selected = { exit: { _tag: "Success", value }, cuts: [] } satisfies typeof completion.Type;
      yield* census({ schema: completion, value: selected });
      const mutation = Completion({ success: S.Struct({ retained: S.Struct({}) }), error: DeliveryError });
      const result = yield* Effect.exit(census({ schema: mutation, value: selected }));
      expect(Exit.isFailure(result)).toBe(true);
      expect(sameObservation({ left: [], right: {} })).toBe(false);
      expect(sameObservation({ left: A.allocate(2), right: [] })).toBe(false);
      const defined = RpcValue(S.Unknown);
      const invalidDefined = yield* Effect.exit(S.encodeEffect(defined)(undefined));
      expect(Exit.isFailure(invalidDefined)).toBe(true);
      const invalidJsonDefined = yield* Effect.exit(
        S.encodeEffect(defined.pipe(S.toCodecJson, S.fromJsonString))(undefined)
      );
      expect(Exit.isFailure(invalidJsonDefined)).toBe(true);
      const presence = S.Struct({
        omitted: RpcOptional(S.Unknown),
        own: RpcOptional(S.Unknown),
        nullable: S.String.pipe(S.NullOr, RpcOptional),
      });
      yield* census({ schema: presence, value: { own: undefined, nullable: null } });
    })
);

it.effect("review2 finding 6: decorated array fails migrated codec without affecting legacy recipient", () =>
  Effect.gen(function* () {
    const decorated = [1];
    Reflect.defineProperty(decorated, "extra", { value: "retained", enumerable: true });
    const encoded = yield* Effect.exit(S.encodeEffect(ObservedValue)(decorated));
    expect(Exit.isFailure(encoded)).toBe(true);
    const delivered: Array<unknown> = [];
    yield* publishRecipient({
      value: decorated,
      migrated: (value) => S.encodeEffect(ObservedValue)(value).pipe(Effect.orDie, Effect.asVoid),
      report: () => Effect.void,
    });
    yield* publishRecipient({
      value: decorated,
      legacy: (value) => {
        delivered.push(value);
      },
      report: () => Effect.void,
    });
    expect(delivered).toEqual([decorated]);
  })
);

it.effect(
  "review2 finding 5: same-epoch replacement rejects old repair identity and bounded metadata fails visibly",
  () =>
    Effect.sync(() => {
      const repair = makeRecovery({ count: 1, bytes: 128 });
      const first = repair.begin("e");
      const second = repair.begin("e");
      expect(repair.accept({ attempt: first, nextEpoch: "e" })).toBe(false);
      expect(repair.accept({ attempt: second, nextEpoch: "e" })).toBe(true);
      expect(repair.touch("first")).toBe(true);
      expect(repair.touch("second")).toBe(false);
      expect(repair.accept({ attempt: second, nextEpoch: "e" })).toBe(false);
      expect(repair.watermark({ id: "one", sequence: 1 })).toBe(true);
      expect(repair.watermark({ id: "two", sequence: 1 })).toBe(false);
      expect(repair.stats().stale).toBe(true);
    })
);

it.effect("review2 finding 3: synchronous publication followed by installer defect releases acquired listener", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let listeners = 0;
      const owner = makeSubscriptions({
        identity: { document: "d", client: "c", generation: 0, epoch: "e" },
        onTerminal: () => {},
      });
      const result = yield* Effect.exit(
        owner.acquire(
          "events",
          (publish, own) => {
            listeners++;
            own(() => {
              listeners--;
            });
            publish(1);
            Result.getOrThrowWith(Result.fail(failure("installer defect")), (error) => error);
          },
          (value) => ({ value, bytes: 8 })
        )
      );
      expect(Exit.isFailure(result)).toBe(true);
      expect(listeners).toBe(0);
    })
  )
);

it.effect("review3 finding 5: throwing teardown release does not abandon earlier releases or queue closure", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const released: Array<string> = [];
      const owner = makeSubscriptions({
        identity: { document: "d", client: "c", generation: 0, epoch: "e" },
        onTerminal: () => {
          Result.getOrThrowWith(Result.fail(failure("terminal failure")), (error) => error);
        },
      });
      const sub = yield* owner.acquire(
        "events",
        (_publish, own) => {
          own(() => {
            released.push("first");
          });
          own(() => {
            released.push("second");
            Result.getOrThrowWith(Result.fail(failure("release failure")), (error) => error);
          });
        },
        (value) => ({ value, bytes: 8 })
      );
      yield* sub.close;
      expect(released).toEqual(["second", "first"]);
      expect(sub.active).toBe(false);
      expect(owner.stats().failedReleases).toBe(1);
      expect(owner.stats().cleanupCauses.length).toBe(2);
    })
  )
);

it.effect("transport: finalized IDs retire and multi-megabyte frames preserve exact text", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { client, main } = yield* pair();
      const text = Str.repeat(1024 * 1024)("🌍");
      const echoed = yield* client.Echo({ text });
      expect(echoed).toBe(text);
      for (let i = 0; i < 400; i++) yield* client.Echo({ text: "next" });
      expect(main.stats().executions).toBe(0);
      expect(main.stats().admission.appUnary).toBe(0);
    })
  )
);

it.effect("review2 finding 3: document closure during synchronous invocation startup prevents late writes", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      const owner = makeInvocationEntry(ownedRuntime);
      const gate = yield* Deferred.make<void>();
      const settled = yield* Deferred.make<Exit.Exit<void, DeliveryError>>();
      let late = 0;
      owner.invoke({
        effect: Effect.gen(function* () {
          owner.close(() => {});
          yield* Deferred.await(gate);
          late++;
        }),
        settle: (exit) => {
          Deferred.doneUnsafe(settled, Exit.succeed(exit));
        },
      });
      const result = yield* Deferred.await(settled);
      yield* Deferred.succeed(gate, undefined);
      yield* Effect.yieldNow;
      expect(Exit.isFailure(result)).toBe(true);
      expect(late).toBe(0);
      expect(owner.pending()).toBe(0);
    })
  )
);

it.effect("review3 finding 6: synchronous captured cleanup runs on immediate success and failure", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      let reserved = 0;
      let cleaned = 0;
      const host = makeSynchronousHost({
        runtime: ownedRuntime,
        reserve: (bytes) => {
          reserved += bytes;
          return true;
        },
        release: (bytes) => {
          reserved -= bytes;
        },
      });
      const success = host.run((call) =>
        Effect.sync(() => {
          call.cleanup(() => {
            cleaned++;
          });
          return 7;
        })
      );
      expect(success).toBe(7);
      const failed = Result.try({
        try: () =>
          host.run((call) =>
            Effect.gen(function* () {
              call.cleanup(() => {
                cleaned++;
              });
              return yield* failure("Expected");
            })
          ),
        catch: (error) => error,
      });
      expect(Result.isFailure(failed)).toBe(true);
      expect(cleaned).toBe(2);
      expect(reserved).toBe(0);
      yield* host.drain;
    })
  )
);

it.effect("review2 finding 2 / review3 finding 2: typed forced terminal while Ack is permanently withheld", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const pairState = yield* pair({ holdAck: true });
      const reading = yield* pairState.client.Never().pipe(Stream.runCollect, Effect.forkChild);
      yield* pairState.firstAck;
      const request = pairState.request();
      const retired = pairState.renderer.retired(request);
      yield* pairState.main.terminate({ session: "document", ...request, error: failure("StreamOverflow") });
      const result = yield* Fiber.await(reading);
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const error = Cause.squash(result.cause);
        expect(S.is(DeliveryError)(error)).toBe(true);
        if (S.is(DeliveryError)(error)) expect(error.reason).toBe("StreamOverflow");
      }
      yield* retired;
      yield* pairState.neverEnded;
      yield* Effect.yieldNow;
      expect(pairState.main.stats().admission.appStreams).toBe(0);
      expect(pairState.main.stats().executions).toBe(0);
      expect(pairState.renderer.stats().workers).toBe(0);
      expect(pairState.renderer.stats().bytes).toBe(0);
      yield* pairState.main.terminate({ session: "document", ...request, error: failure("LateDuplicate") });
      const reply = yield* pairState.client.Echo({ text: "unrelated still progresses" });
      expect(reply).toBe("unrelated still progresses");
    })
  )
);

it.effect("review3 finding 1: ordinary declared subscription envelope crosses installed RpcServer/RpcClient", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { client } = yield* pair();
      const values = yield* Stream.runCollect(client.Observe());
      expect(A.map(values, (value) => value._tag)).toEqual(["Registered", "Observation", "Observation"]);
      const observations = A.filter(values, (value) => value._tag === "Observation");
      expect(A.map(observations, (value) => value.sequence)).toEqual([1, 2]);
      expect(A.map(observations, (value) => value.value)).toEqual([1, 2]);
    })
  )
);

it.effect("original failures: recognized carrier unwraps exact thrown identity and lookalikes stay untouched", () =>
  Effect.sync(() => {
    const original = { host: "original" };
    const carrier = originalFailure({ operation: "fixture", original, legacyMessage: "original text" });
    expect(unwrapOriginal(carrier)).toBe(original);
    const lookalike = { _tag: "OriginalFailure", original, operation: "fixture", legacyMessage: "lookalike" };
    expect(unwrapOriginal(lookalike)).toBe(lookalike);
  })
);

it.effect("review2 finding 4: operation factory defect settles logical failure and releases reservation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let bytes = 0;
      const owner = yield* makeOperations({
        reserve: (_origin, amount) => {
          bytes += amount;
          return true;
        },
        release: (_origin, amount) => {
          bytes -= amount;
        },
      });
      const handle = yield* owner.accept({
        originAccount: "window",
        reserveBytes: 20,
        run: () => Result.getOrThrowWith(Result.fail(failure("FactoryDefect")), (error) => error),
      });
      const logical = yield* handle.logical;
      expect(Exit.isFailure(logical)).toBe(true);
      yield* handle.released;
      expect(bytes).toBe(0);
    })
  )
);

it.effect("review3 finding 9: defect after logical completion is reported without replacing committed result", () => {
  const reports: Array<unknown> = [];
  const logging = Logger.make((entry) => {
    reports.push(entry.message);
  });
  return Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* makeOperations({ reserve: () => true, release: () => {} });
      const handle = yield* owner.accept({
        originAccount: "window",
        reserveBytes: 20,
        run: Effect.fn("Test.postComplete")(function* (handle: OperationHandle<string, never>) {
          yield* handle.complete(Exit.succeed("committed")).pipe(Effect.orDie);
          return yield* Effect.die("post-completion defect");
        }),
      });
      const logical = yield* handle.logical;
      yield* handle.released;
      expect(logical).toEqual(Exit.succeed("committed"));
      expect(reports.length).toBe(1);
    })
  ).pipe(Effect.withLogger(logging));
});

it.effect("review3 finding 3: repeated outbound encoding failures roll back every request worker", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { client, renderer, main } = yield* pair();
      for (let i = 0; i < 100; i++) {
        const result = yield* Effect.exit(
          renderer.protocol.send(0, { _tag: "Request", id: i, tag: "Echo", payload: 1n, headers: [] })
        );
        expect(Exit.isFailure(result)).toBe(true);
        expect(renderer.stats().workers).toBe(0);
        expect(renderer.stats().bytes).toBe(0);
      }
      expect(main.stats().executions).toBe(0);
      expect(main.stats().admission.appUnary).toBe(0);
      const reply = yield* client.Echo({ text: "still usable" });
      expect(reply).toBe("still usable");
    })
  )
);

it.effect("native retention: installed server request finalizer detaches document but keeps actual native lease", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const transport = yield* pair();
      const invocation = yield* Effect.forkChild(transport.client.Native());
      yield* transport.nativeStarted;
      transport.disconnectMain();
      yield* transport.nativeEnded;
      yield* Fiber.interrupt(invocation);
      expect(transport.main.stats().admission.appNative).toBe(1);
      expect(transport.main.stats().admission.appUnary).toBe(1);
      expect(transport.main.stats().admission.appBytes).toBe(4096);
      yield* transport.completeNative();
      yield* Effect.yieldNow;
      expect(transport.main.stats().admission.appNative).toBe(0);
      expect(transport.main.stats().admission.appUnary).toBe(0);
      expect(transport.main.stats().admission.appBytes).toBe(0);
    })
  )
);

it.effect("notifications: explicit recipients preserve order and repeated success/finalizer publications", () =>
  Effect.gen(function* () {
    const received: Array<string> = [];
    const sink = makeNotifications(
      Effect.succeed([
        {
          account: "a",
          activeMain: true,
          send: () =>
            Effect.sync(() => {
              received.push("a");
            }),
        },
        {
          account: "b",
          activeMain: false,
          send: () =>
            Effect.sync(() => {
              received.push("b");
            }),
        },
      ])
    );
    yield* sink.publish({ recipients: { kind: "all-live-windows" }, channel: "fixture", value: null });
    yield* sink.publish({ recipients: { kind: "all-live-windows" }, channel: "fixture", value: null });
    yield* sink.publish({ recipients: { kind: "active-main" }, channel: "fixture", value: null });
    yield* sink.publish({ recipients: { kind: "window", account: "b" }, channel: "fixture", value: null });
    expect(received).toEqual(["a", "b", "a", "b", "a", "b"]);
  })
);

it.effect("review1 finding 3: direct invocation results remain independent under reverse completion", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      const owner = makeInvocationEntry(ownedRuntime);
      const held = yield* Deferred.make<void>();
      const first = yield* Deferred.make<Exit.Exit<never, DeliveryError>>();
      const second = yield* Deferred.make<Exit.Exit<number, DeliveryError>>();
      owner.invoke({
        effect: Deferred.await(held).pipe(Effect.andThen(failure("FirstFailed"))),
        settle: (exit) => {
          Deferred.doneUnsafe(first, Exit.succeed(exit));
        },
      });
      owner.invoke({
        effect: Effect.succeed(99),
        settle: (exit) => {
          Deferred.doneUnsafe(second, Exit.succeed(exit));
        },
      });
      const b = yield* Deferred.await(second);
      expect(b).toEqual(Exit.succeed(99));
      expect(owner.pending()).toBe(1);
      yield* Deferred.succeed(held, undefined);
      const a = yield* Deferred.await(first);
      expect(Exit.isFailure(a)).toBe(true);
      expect(owner.pending()).toBe(0);
      owner.close(() => {});
    })
  )
);

it.effect("review2 finding 7: auth registrations have independent count/byte admission and document retirement", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      const owner = makeInvocationEntry(ownedRuntime);
      let calls = 0;
      for (let index = 0; index < 256; index++) {
        const registered = owner.registerAuth({
          callback: () => {
            calls++;
          },
          retainedBytes: 0,
        });
        expect(Result.isSuccess(registered)).toBe(true);
      }
      expect(
        Result.isFailure(
          owner.registerAuth({
            callback: () => {
              calls += 10000;
            },
            retainedBytes: 0,
          })
        )
      ).toBe(true);
      owner.emitAuth();
      expect(calls).toBe(256);
      expect(owner.callbackStats()).toEqual({ count: 256, bytes: 256 * 256 });
      owner.close(() => {});
      expect(owner.callbackStats()).toEqual({ count: 0, bytes: 0 });
      owner.emitAuth();
      expect(calls).toBe(256);
      const byteOwner = makeInvocationEntry(ownedRuntime);
      let byteCalls = 0;
      expect(
        Result.isSuccess(
          byteOwner.registerAuth({
            callback: () => {
              byteCalls++;
            },
            retainedBytes: 256 * 1024,
          })
        )
      ).toBe(true);
      expect(Result.isFailure(byteOwner.registerAuth({ callback: () => {}, retainedBytes: 0 }))).toBe(true);
      byteOwner.emitAuth();
      expect(byteCalls).toBe(1);
      expect(byteOwner.callbackStats()).toEqual({ count: 1, bytes: 256 * 1024 });
      byteOwner.close(() => {});
    })
  )
);

it.effect("review1 finding 3: actual AtomRegistry disposal cannot strand the document-owned caller", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      const owner = makeInvocationEntry(ownedRuntime);
      const registry = Registry.make();
      const started = yield* Deferred.make<void>();
      const ended = yield* Deferred.make<void>();
      const settled = yield* Deferred.make<Exit.Exit<number, DeliveryError>>();
      const atom = Atom.make<number, never>(
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Deferred.succeed(ended, undefined))
        )
      );
      const release = registry.mount(atom);
      owner.invoke<number, never>({
        effect: Registry.getResult<number, never>(registry, atom, { suspendOnWaiting: true }),
        settle: (exit) => {
          Deferred.doneUnsafe(settled, Exit.succeed(exit));
        },
      });
      yield* Deferred.await(started);
      owner.close(() => registry.dispose());
      const result = yield* Deferred.await(settled);
      yield* Deferred.await(ended);
      expect(Exit.isFailure(result)).toBe(true);
      expect(owner.pending()).toBe(0);
      release();
    })
  )
);

it.effect("review2 finding 1: actually full RpcClient queue does not block same-client or other-client replies", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const transport = yield* pair();
      const consumerStarted = yield* Deferred.make<void>();
      const releaseConsumer = yield* Deferred.make<void>();
      const reading = yield* transport.client.Flood().pipe(
        Stream.runForEach(() =>
          Deferred.succeed(consumerStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseConsumer)))
        ),
        Effect.forkChild
      );
      yield* Deferred.await(consumerStarted);
      const streamRequest = transport.request();
      const retired = transport.renderer.retired(streamRequest);
      expect(transport.wireStats().largestChunk).toBe(1024);
      expect(transport.wireStats().acks).toBe(0);
      const other = yield* transport.nextClient;
      const sameReply = yield* Effect.forkChild(transport.client.Echo({ text: "same client" }));
      const otherReply = yield* Effect.forkChild(other.Echo({ text: "other client" }));
      const sameValue = yield* Fiber.join(sameReply);
      const otherValue = yield* Fiber.join(otherReply);
      expect(sameValue).toBe("same client");
      expect(otherValue).toBe("other client");
      expect(transport.wireStats().acks).toBe(0);
      expect(transport.renderer.stats().bytes).toBeGreaterThan(0);
      yield* Deferred.succeed(releaseConsumer, undefined);
      yield* Fiber.join(reading);
      yield* retired;
      expect(transport.renderer.stats().bytes).toBe(0);
      expect(transport.renderer.stats().workers).toBe(0);
    })
  )
);

it.effect(
  "review1 finding 6 / review3 finding 7: recipient snapshots survive later mutation and later legacy failure",
  () =>
    Effect.gen(function* () {
      const state = { count: 1, nested: { text: "before" } };
      const snapshots: Array<unknown> = [];
      const migrated = (value: unknown) =>
        S.encodeEffect(ObservedValue)(value).pipe(
          Effect.flatMap(S.decodeEffect(ObservedValue)),
          Effect.tap((snapshot) =>
            Effect.sync(() => {
              snapshots.push(snapshot);
            })
          ),
          Effect.orDie,
          Effect.asVoid
        );
      yield* publishRecipient({
        value: state,
        legacy: (value) => {
          value.count = 2;
        },
        migrated,
        report: () => Effect.void,
      });
      state.count = 3;
      state.nested.text = "second";
      yield* publishRecipient({ value: state, migrated, report: () => Effect.void });
      state.count = 4;
      state.nested.text = "after";
      const later = yield* Effect.exit(
        publishRecipient({
          value: state,
          legacy: () => {
            Result.getOrThrowWith(Result.fail(failure("LegacySendFailed")), (error) => error);
          },
          migrated,
          report: () => Effect.void,
        })
      );
      expect(Exit.isFailure(later)).toBe(true);
      expect(snapshots).toEqual([
        { count: 2, nested: { text: "before" } },
        { count: 3, nested: { text: "second" } },
      ]);
    })
);

it.effect("review2 finding 7: revoke before interruption finalizers and refuse bounded quarantined startup", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      let writes = 0;
      let cleanup = 0;
      const host = makeSynchronousHost({ runtime: ownedRuntime, capacity: 1, reserve: () => true, release: () => {} });
      const interrupted = Result.try({
        try: () =>
          host.run((call) =>
            Effect.sync(() =>
              call.cleanup(() => {
                cleanup++;
              })
            ).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() =>
                  call.use(() => {
                    writes++;
                  })
                )
              )
            )
          ),
        catch: (error) => error,
      });
      expect(Result.isFailure(interrupted)).toBe(true);
      expect(writes).toBe(0);
      expect(cleanup).toBe(1);
      const held = yield* Deferred.make<void>();
      const suspended = Result.try({
        try: () =>
          host.run((call) =>
            Deferred.await(held).pipe(
              Effect.uninterruptible,
              Effect.andThen(
                Effect.sync(() =>
                  call.use(() => {
                    writes++;
                  })
                )
              )
            )
          ),
        catch: (error) => error,
      });
      expect(Result.isFailure(suspended)).toBe(true);
      expect(host.stats().count).toBe(1);
      let secondStarted = false;
      const refused = Result.try({
        try: () =>
          host.run(() => {
            secondStarted = true;
            return Effect.void;
          }),
        catch: (error) => error,
      });
      expect(Result.isFailure(refused)).toBe(true);
      expect(secondStarted).toBe(false);
      yield* Deferred.succeed(held, undefined);
      yield* host.drain;
      expect(writes).toBe(0);
      expect(host.stats().count).toBe(0);
    })
  )
);

it.effect("review3 finding 6: failed synchronous cleanup attempts every release and retains its reservation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ownedRuntime = yield* runtime;
      const released: Array<string> = [];
      const host = makeSynchronousHost({
        runtime: ownedRuntime,
        reserve: () => true,
        release: () => {
          released.push("reservation");
        },
      });
      const result = host.run((call) =>
        Effect.sync(() => {
          call.cleanup(() => {
            released.push("failed");
            Result.getOrThrowWith(Result.fail(failure("CleanupFailed")), (error) => error);
          });
          call.cleanup(() => {
            released.push("remaining");
          });
          return 7;
        })
      );
      expect(result).toBe(7);
      expect(released).toEqual(["failed", "remaining"]);
      const drain = yield* Effect.exit(host.drain);
      expect(Exit.isFailure(drain)).toBe(true);
      expect(host.stats()).toEqual({ count: 1, bytes: 4096, cleanupFailures: 1 });
    })
  )
);

it.effect(
  "review2 finding 4: failed operation cleanup visits remaining tasks and retains work and byte admission",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        let bytes = 0;
        let cleanup = 0;
        const owner = yield* makeOperations(
          {
            reserve: (_origin, amount) => {
              bytes += amount;
              return true;
            },
            release: (_origin, amount) => {
              bytes -= amount;
            },
          },
          1
        );
        const handle = yield* owner.accept({
          originAccount: "window",
          reserveBytes: 20,
          run: Effect.fn("Test.failedCleanup")(function* (handle: OperationHandle<string, never>) {
            yield* handle.registerCleanup(Effect.die("cleanup defect"));
            yield* handle.registerCleanup(
              Effect.sync(() => {
                cleanup++;
              })
            );
            yield* handle.complete(Exit.succeed("committed"));
          }, Effect.orDie),
        });
        const logical = yield* handle.logical;
        expect(logical).toEqual(Exit.succeed("committed"));
        const released = yield* Effect.exit(handle.released);
        expect(Exit.isFailure(released)).toBe(true);
        expect(cleanup).toBe(1);
        expect(bytes).toBe(532);
        let started = false;
        const refused = yield* Effect.exit(
          owner.accept({
            originAccount: "window",
            reserveBytes: 1,
            run: () => {
              started = true;
              return Effect.void;
            },
          })
        );
        expect(Exit.isFailure(refused)).toBe(true);
        expect(started).toBe(false);
        const drained = yield* Effect.exit(owner.drain);
        expect(Exit.isFailure(drained)).toBe(true);
      })
    )
);

it.effect(
  "review3 finding 3: forced terminal interrupts an actually blocked dispatcher and releases its in-flight charge",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const transport = yield* pair();
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const reading = yield* transport.client.Flood().pipe(
          Stream.runForEach(() => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)))),
          Effect.forkChild
        );
        yield* Deferred.await(started);
        const request = transport.request();
        const retired = transport.renderer.retired(request);
        expect(transport.wireStats().largestChunk).toBe(1024);
        expect(transport.wireStats().acks).toBe(0);
        expect(transport.renderer.stats().bytes).toBeGreaterThan(0);
        yield* transport.main.terminate({ session: "document", ...request, error: failure("StreamOverflow") });
        yield* retired;
        expect(transport.renderer.stats().workers).toBe(0);
        expect(transport.renderer.stats().bytes).toBe(0);
        yield* Deferred.succeed(release, undefined);
        const result = yield* Fiber.await(reading);
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = Cause.squash(result.cause);
          expect(S.is(DeliveryError)(error)).toBe(true);
          if (S.is(DeliveryError)(error)) expect(error.reason).toBe("StreamOverflow");
        }
        const reply = yield* transport.client.Echo({ text: "same client survived" });
        expect(reply).toBe("same client survived");
      })
    )
);

it.effect("transport reload: queued old-session ingress cannot recreate a client or interrupt another window", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const transport = yield* pair();
      yield* transport.client.Echo({ text: "original document" });
      const original = transport.request();
      transport.disconnectMain();
      yield* transport.renderer.protocol.send(original.client, {
        _tag: "Request",
        id: "old-document",
        tag: "Echo",
        payload: { text: "stale" },
        headers: [],
      });
      const otherWindow = yield* transport.nextWindow;
      const result = yield* otherWindow.Echo({ text: "other window remains live" });
      expect(result).toBe("other window remains live");
      expect(transport.main.stats().clients).toBe(1);
      expect(transport.main.stats().admission.sessions).toBe(1);
      expect(transport.main.stats().executions).toBe(0);
    })
  )
);
