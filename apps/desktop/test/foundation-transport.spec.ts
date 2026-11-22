import { it } from "@effect/vitest";
import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
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
import * as RpcMessage from "effect/rpc/RpcMessage";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as Scope from "effect/Scope";
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
import {
  makeInvocationEntry,
  makeInvocationOwner,
  makeRendererDocumentOwner,
  makeTransportFailureOwner,
} from "../src/renderer/src/runtime/RendererInvocation.entry.js";
import { makeRecovery } from "../src/renderer/src/runtime/StreamRecovery.atoms.js";
import {
  DeliveryError,
  ElectronRpcCapacityError,
  ElectronRpcTransportError,
  failure,
} from "../src/renderer/src/transport/DocumentDelivery.errors.js";
import { layer as deliveryLayer } from "../src/renderer/src/transport/DocumentDelivery.layer.js";
import { Completion, Subscription } from "../src/renderer/src/transport/DocumentDelivery.model.js";
import { DocumentDelivery, makeDeliveryGate } from "../src/renderer/src/transport/DocumentDelivery.service.js";
import {
  DocumentResources,
  Input,
  makeCodecOwnership,
  makeResourceBudget,
  makeRetentionLedger,
  measureFrame,
  measureValue,
  Output,
} from "../src/renderer/src/transport/ElectronRpc.model.js";
import { DesktopRpcConnection, makeClientProtocol } from "../src/renderer/src/transport/ElectronRpcClient.layer.js";
import { census, sameObservation } from "../src/renderer/src/transport/RpcCensus.model.js";
import { RpcOptional, RpcValue } from "../src/renderer/src/transport/RpcField.model.js";
import { ObservedValue, pack } from "../src/renderer/src/transport/RpcObservation.model.js";
import { runtime } from "./TransportRuntime.entry.js";
import type { OperationHandle } from "../src/main/runtime/ApplicationOperations.service.js";

const $TransportId = $DesktopId.create("test/foundation-transport.spec");

const Binary = Rpc.make("Binary", {
  payload: { bytes: S.Uint8ArrayFromBase64 },
  success: S.Uint8ArrayFromBase64,
  error: DeliveryError,
});
const Echo = Rpc.make("Echo", { payload: { text: S.String }, success: S.String, error: DeliveryError });
const Watch = Rpc.make("Watch", { success: S.Int, error: DeliveryError, stream: true });
const Fail = Rpc.make("Fail", { success: S.Void, error: DeliveryError });
const Defect = Rpc.make("Defect", { success: S.Void, error: DeliveryError });
const Never = Rpc.make("Never", { success: S.Int, error: DeliveryError, stream: true });
const Observe = Rpc.make("Observe", { success: Subscription(S.Int), error: DeliveryError, stream: true });
const Native = Rpc.make("Native", { success: S.Boolean, error: DeliveryError });
const Traffic = Rpc.make("Traffic", { success: S.String, error: DeliveryError, stream: true });
const Flood = Rpc.make("Flood", { success: S.Int, error: DeliveryError, stream: true });
const Rpcs = RpcGroup.make(Binary, Echo, Watch, Fail, Defect, Never, Observe, Native, Flood, Traffic);
const pair = Effect.fn("Test.pair")(function* ({
  holdAck = false,
  failTerminalEncoding = false,
  requestIds,
  observeHeld = false,
  permit = () => true,
}: {
  readonly permit?: (tag: string) => boolean;
  readonly observeHeld?: boolean;
  readonly holdAck?: boolean;
  readonly failTerminalEncoding?: boolean;
  readonly requestIds?: ReadonlyArray<string | number>;
} = {}) {
  let receiveMain: (value: unknown, session: string, account: string) => void = () => {};
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
  let terminalEncodes = 0;
  let storageReleases: ReadonlyArray<number> = [];
  let chunkStorage: number | undefined;
  let exitStorage: number | undefined;
  let sentMainFrames = 0;
  let observeActive = () => false;
  let lastRequest: { readonly client: number; readonly requestId: string | number } = { client: 0, requestId: 0 };
  let admissionAttempts = 0;
  let dispatchedRequests = 0;
  const baseAdmission = makeAdmission();
  const admission = {
    ...baseAdmission,
    admit: (request: Parameters<typeof baseAdmission.admit>[0]) =>
      Effect.suspend(() => {
        admissionAttempts++;
        return baseAdmission.admit(request);
      }),
  };
  admission.connectNow("document", "window");
  const main = yield* makeServerProtocol({
    isStream: (tag) => tag === "Watch" || tag === "Never" || tag === "Observe" || tag === "Flood" || tag === "Traffic",
    encodeFailure: (tag, error) => {
      terminalEncodes++;
      if (failTerminalEncoding) return Effect.fail(failure("InjectedEncodingFailure"));
      const schema =
        tag === "Watch" || tag === "Never"
          ? Rpc.exitSchema(Watch)
          : Rpc.exitSchema(Echo).pipe(
              $TransportId.annoteSchema("schema", { description: "schema boundary in the desktop transport contract." })
            );
      return S.encodeEffect(RpcSerialization.json.codecFor(schema))(error.pipe(Exit.fail)).pipe(
        Effect.mapError(() => failure("EncodeFailed"))
      );
    },
  }).pipe(
    Effect.provideService(ElectronRpcAdmission, admission),
    Effect.provideService(ElectronRpcWire, {
      authorize: (session, tag) => Effect.succeed(session === "other" || permit(tag)),
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
            chunkStorage = parsed.success.storageId;
            largestChunk = Math.max(largestChunk, parsed.success.message.values.length);
            Deferred.doneUnsafe(chunk, Exit.void);
          }
          if (Result.isSuccess(parsed) && parsed.success.message._tag === "Exit")
            exitStorage = parsed.success.storageId;
          receiveRenderer(frame);
        }),
    })
  );
  const rendererLedger = makeRetentionLedger();
  rendererLedger.connect("document", "renderer-window");
  const renderer = yield* makeClientProtocol().pipe(
    Effect.provideService(DesktopRpcConnection, {
      retention: rendererLedger.document("document") ?? rendererLedger.forWindow("renderer-window"),
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
            if (parsed.success.message._tag === "StorageReleased")
              storageReleases = A.append(storageReleases, parsed.success.message.storageId);
            if (holdAck && parsed.success.message._tag === "Ack") return;
          }
          if (documentLive) {
            sentMainFrames++;
            receiveMain(frame, "document", "window");
          }
        }),
    })
  );
  const handlers = Rpcs.toLayer({
    Binary: ({ bytes }) => Effect.succeed(bytes),
    Echo: Effect.fn("Test.Echo")(function* ({ text }, options) {
      if (text === "saturate codec arena") {
        const lease = yield* main.requestLease(options.headers);
        const held = lease.resources.account.reserve(64 * 1024 * 1024);
        if (held === undefined) return yield* failure("TestCapacity");
        yield* Effect.addFinalizer(() => Effect.sync(held.release));
      }
      return text;
    }),
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
    Traffic: () =>
      Stream.range(1, 256).pipe(
        Stream.map(() => Str.repeat(64 * 1024)("x")),
        Stream.rechunk(1)
      ),
    Observe: (_payload, options) =>
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
          observeActive = () => sub.active;
          if (observeHeld)
            yield* main.ownSubscription(options.headers, {
              registered: { _tag: "Registered", token: sub.token, epoch: sub.epoch },
              close: sub.close,
            });
          return observeHeld ? subscriptions.watch(sub) : subscriptions.watch(sub).pipe(Stream.take(3));
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
      Effect.provideService(RpcServer.Protocol, {
        ...main.protocol,
        run: (write) =>
          main.protocol.run((id, message) => {
            if (message._tag === "Request") dispatchedRequests++;
            return write(id, message);
          }),
      })
    )
  );
  let serial = 0;
  const client = yield* renderer.makeClient(Rpcs, {
    generateRequestId:
      requestIds === undefined ? undefined : () => RpcMessage.RequestId(requestIds[serial++] ?? serial + 1000),
  });
  return {
    client,
    rawIngress: (raw: unknown) => receiveMain(raw, "document", "window"),
    rawResponse: (raw: unknown) => receiveRenderer(raw),
    unknownClient: renderer.makeClient(
      Rpc.make("Missing", { success: S.Void, error: DeliveryError }).pipe(RpcGroup.make)
    ),
    ingress: (input: Input) =>
      S.encodeEffect(S.fromJsonString(Input))(input).pipe(
        Effect.map((frame) => receiveMain(frame, input.session, input.session === "other" ? "other-window" : "window"))
      ),
    main,
    renderer,
    rendererLedger,
    firstChunk: Deferred.await(chunk),
    firstAck: Deferred.await(firstAck),
    wireStats: () => ({ acks, largestChunk }),
    storageStats: () => ({ released: storageReleases, chunkStorage, exitStorage, sentMainFrames }),
    terminalEncodes: () => terminalEncodes,
    observeActive: () => observeActive(),
    boundaryStats: () => ({ admissionAttempts, dispatchedRequests }),
    nextClient: renderer.makeClient(Rpcs),
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
          send: (frame) => Effect.sync(() => receiveMain(frame, "other", "other-window")),
        })
      );
      return yield* other.makeClient(Rpcs);
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
      const success = S.Struct({ retained: ObservedValue }).pipe(
        $TransportId.annoteSchema("success", { description: "success boundary in the desktop transport contract." })
      );
      const completion = Completion({ success, error: DeliveryError }).pipe(
        $TransportId.annoteSchema("completion", {
          description: "completion boundary in the desktop transport contract.",
        })
      );
      const selected = { exit: { _tag: "Success", value }, cuts: [] } satisfies typeof completion.Type;
      yield* census({ schema: completion, value: selected });
      const mutation = Completion({ success: S.Struct({ retained: S.Struct({}) }), error: DeliveryError }).pipe(
        $TransportId.annoteSchema("mutation", { description: "mutation boundary in the desktop transport contract." })
      );
      const result = yield* Effect.exit(census({ schema: mutation, value: selected }));
      expect(Exit.isFailure(result)).toBe(true);
      expect(sameObservation({ left: [], right: {} })).toBe(false);
      expect(sameObservation({ left: A.allocate(2), right: [] })).toBe(false);
      const defined = RpcValue(S.Unknown).pipe(
        $TransportId.annoteSchema("defined", { description: "defined boundary in the desktop transport contract." })
      );
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
      }).pipe(
        $TransportId.annoteSchema("presence", { description: "presence boundary in the desktop transport contract." })
      );
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
      const original = failure("FactoryDefect");
      const handle = yield* owner.accept({
        originAccount: "window",
        reserveBytes: 20,
        run: () => Result.getOrThrowWith(Result.fail(original), (error) => error),
      });
      const logical = yield* handle.logical;
      expect(Exit.isFailure(logical)).toBe(true);
      if (Exit.isFailure(logical)) expect(Cause.squash(logical.cause)).toBe(original);
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
      yield* Effect.yieldNow;
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
      const queued = yield* S.encodeEffect(S.fromJsonString(Input))({
        session: "document",
        client: original.client,
        message: {
          _tag: "Request",
          id: "queued-before-departure",
          tag: "Echo",
          payload: { text: "queued" },
          headers: [],
        },
      });
      // Authentication succeeded before departure; the physical drain has not run yet.
      transport.rawIngress(queued);
      transport.disconnectMain();
      const departed = yield* S.encodeEffect(S.fromJsonString(Output))({
        session: "document",
        client: 0,
        message: { _tag: "DocumentClosed" },
      });
      transport.rawResponse(departed);
      yield* Effect.gen(function* () {
        while (transport.renderer.stats().clients !== 0) yield* Effect.yieldNow;
      }).pipe(Effect.timeout("300 millis"));
      const stale = yield* Effect.exit(
        transport.renderer.protocol.send(original.client, {
          _tag: "Request",
          id: "old-document",
          tag: "Echo",
          payload: { text: "stale" },
          headers: [],
        })
      );
      expect(Exit.isFailure(stale)).toBe(true);
      const otherWindow = yield* transport.nextWindow;
      const result = yield* otherWindow.Echo({ text: "other window remains live" });
      expect(result).toBe("other window remains live");
      expect(transport.main.stats().clients).toBe(1);
      expect(transport.main.stats().admission.sessions).toBe(1);
      expect(transport.main.stats().executions).toBe(0);
    })
  )
);

it.effect("adapter ownership: terminal encoding failure closes only its logical client", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ holdAck: true, failTerminalEncoding: true });
      const other = yield* owner.nextClient;
      const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
      yield* owner.firstAck;
      yield* owner.main.terminate({ session: "document", ...owner.request(), error: failure("StreamOverflow") });
      const watched = yield* Fiber.await(watching);
      expect(Exit.isFailure(watched)).toBe(true);
      yield* owner.neverEnded;
      const survived = yield* other.Echo({ text: "survives" });
      expect(survived).toBe("survives");
      expect(owner.main.stats().executions).toBe(0);
    })
  )
);

it.effect("adapter ownership: unknown controls never create mappings and native callback commands are supervised", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ holdAck: true });
      for (let client = 100; client < 1100; client++) {
        yield* owner.ingress({ session: "document", client, message: { _tag: "Ping" } });
        yield* Effect.yieldNow;
      }
      expect(owner.main.stats().clients).toBe(0);
      const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
      yield* owner.firstAck;
      expect(
        owner.main.submitTermination({ session: "document", ...owner.request(), error: failure("StreamOverflow") })
      ).toBe(true);
      const watched = yield* Fiber.await(watching);
      expect(Exit.isFailure(watched)).toBe(true);
      yield* owner.neverEnded;
      yield* owner.renderer.retired(owner.request());
      expect(owner.renderer.stats().workers).toBe(0);
    })
  )
);

it.effect("adapter ownership: closed-client history has a document ceiling and retires with that document", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const other = yield* owner.nextWindow;
      const ready = yield* other.Echo({ text: "ready" });
      expect(ready).toBe("ready");
      for (let client = 100; client < 165; client++) {
        yield* owner.ingress({
          session: "document",
          client,
          message: { _tag: "Request", id: 1, tag: "Echo", payload: { text: "x" }, headers: [] },
        });
        yield* Effect.yieldNow;
        yield* owner.ingress({
          session: "document",
          client,
          message: {
            _tag: "Request",
            id: "@effect/rpc/notification/x",
            tag: "Echo",
            payload: { text: "x" },
            headers: [],
          },
        });
        yield* Effect.yieldNow;
      }
      const barrier = yield* Effect.exit(
        owner.client.Echo({ text: "history barrier" }).pipe(Effect.timeout("500 millis"))
      );
      expect(Exit.isFailure(barrier)).toBe(true);
      if (Exit.isFailure(barrier)) expect(Cause.pretty(barrier.cause)).not.toContain("Timeout");
      expect(owner.main.stats().closedClients).toBeLessThanOrEqual(64);
      const isolated = yield* other.Echo({ text: "isolated" });
      expect(isolated).toBe("isolated");
      owner.disconnectMain();
      yield* Effect.yieldNow;
      expect(owner.main.stats().closedClients).toBe(0);
    })
  )
);

it.effect(
  "retention ledger: data saturation preserves control, copies precharge and reload cannot reset a window",
  () =>
    Effect.gen(function* () {
      const ledger = makeRetentionLedger({ windowBytes: 1024, appBytes: 2048, controlBytes: 64 });
      expect(ledger.connect("old", "window")).toBe(true);
      const origin = ledger.document("old");
      const retained = origin?.reserve(900);
      expect(retained).toBeDefined();
      expect(origin?.reserve(125)).toBeUndefined();
      const terminal = origin?.reserve(64, true);
      expect(terminal).toBeDefined();
      expect(origin?.reserve(1, true)).toBeUndefined();
      ledger.disconnect("old");
      expect(ledger.connect("new", "window")).toBe(true);
      const current = ledger.document("new");
      expect(current?.reserve(125)).toBeUndefined();
      expect(retained?.resize(901)).toBe(false);
      retained?.release();
      terminal?.release();
      const copy = current?.reserve(1024);
      expect(copy).toBeDefined();
      copy?.release();
      copy?.release();
      ledger.disconnect("new");
      expect(ledger.stats()).toMatchObject({ data: 0, control: 0, leases: 0, windows: 0 });
      expect(measureFrame('"🌍"').utf8).toBe(6);
      expect(measureFrame('"\\""').retained).toBeGreaterThan(0);
      expect(measureValue({ nested: [1, 2, "x"] })).toBeGreaterThan(0);
      yield* Effect.void;
    })
);

it.effect("common sub-budgets: repair attempt aggregate, auth aggregate and client-specific cut retirement", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ledger = makeRetentionLedger();
      ledger.connect("document", "window");
      const resources = makeResourceBudget(ledger.forWindow("window"));
      const repairs = A.makeBy(17, () => makeRecovery({ resources }));
      const attempts = A.map(repairs, (repair) => repair.begin("epoch"));
      expect(repairs[16]?.accept({ attempt: attempts[16] ?? {}, nextEpoch: "epoch" })).toBe(false);
      repairs[0]?.dispose();
      const retry = repairs[16]?.begin("epoch");
      expect(repairs[16]?.accept({ attempt: retry ?? {}, nextEpoch: "epoch" })).toBe(true);
      for (const repair of repairs) repair.dispose();
      const managed = yield* runtime;
      const a = makeInvocationOwner({ runtime: managed, resources });
      const b = makeInvocationOwner({ runtime: managed, resources });
      for (let index = 0; index < 128; index++) {
        expect(Result.isSuccess(a.registerAuth({ callback: () => {}, retainedBytes: 256 }))).toBe(true);
        expect(Result.isSuccess(b.registerAuth({ callback: () => {}, retainedBytes: 256 }))).toBe(true);
      }
      expect(Result.isFailure(b.registerAuth({ callback: () => {}, retainedBytes: 256 }))).toBe(true);
      a.close(() => {});
      b.close(() => {});
      const gate = makeDeliveryGate({ resources });
      const cutA = {
        token: { document: "d", client: "a", generation: 0, family: "events", serial: 0 },
        epoch: "e",
        through: 1,
      };
      const cutB = { ...cutA, token: { ...cutA.token, client: "b" } };
      gate.applied({ ...cutB, through: 0 });
      const waitingA = yield* Effect.forkScoped(gate.awaitCuts([cutA]));
      const waitingB = yield* Effect.forkScoped(gate.awaitCuts([cutB]));
      yield* Effect.yieldNow;
      gate.retireClient("a");
      expect(gate.stats().tokens).toBe(1);
      gate.applied(cutB);
      const resultA = yield* Fiber.await(waitingA);
      const resultB = yield* Fiber.await(waitingB);
      expect(Exit.isFailure(resultA)).toBe(true);
      expect(Exit.isSuccess(resultB)).toBe(true);
      gate.disconnect();
      ledger.disconnect("document");
      expect(ledger.stats().data).toBe(0);
    })
  )
);

it.effect("common native pool: operation owners share per-origin slots across document departure", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const admission = makeAdmission({ ...limits, native: 1, appNative: 2 });
      const first = yield* makeOperations(admission.operationAccount);
      const second = yield* makeOperations(admission.operationAccount);
      const end = yield* Deferred.make<void>();
      let factories = 0;
      const run = Effect.fn("Test.nativeOperation")(function* () {
        factories++;
        yield* Deferred.await(end);
      });
      const a = yield* first.accept({ originAccount: "window", reserveBytes: 1024, run });
      const denied = yield* Effect.exit(second.accept({ originAccount: "window", reserveBytes: 1024, run }));
      expect(Exit.isFailure(denied)).toBe(true);
      const b = yield* second.accept({ originAccount: "other", reserveBytes: 1024, run });
      yield* Effect.yieldNow;
      expect(factories).toBe(2);
      expect(admission.stats().appNative).toBe(2);
      yield* Deferred.succeed(end, undefined);
      yield* a.released;
      yield* b.released;
      expect(admission.stats().appNative).toBe(0);
      expect(admission.stats().appBytes).toBe(0);
    })
  )
);

for (const requestIds of [
  [17, "17"],
  ["17", 17],
]) {
  it.effect(
    `transport identity: numeric/string IDs coexist in ordering ${requestIds[0] === 17 ? "number-first" : "string-first"}`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const owner = yield* pair({ requestIds });
          const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
          yield* owner.firstAck;
          const result = yield* owner.client.Echo({ text: "independent" });
          expect(result).toBe("independent");
          yield* Fiber.interrupt(watching);
          yield* owner.neverEnded;
        })
      )
  );
}

it.effect("transport acceptance: unknown procedure retires admission and leaves client live", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const unknown = yield* owner.unknownClient;
      const rejected = yield* Effect.exit(unknown.Missing());
      expect(Exit.isFailure(rejected)).toBe(true);
      const result = yield* owner.client.Echo({ text: "after unknown" });
      expect(result).toBe("after unknown");
      expect(owner.main.stats().executions).toBe(0);
    })
  )
);

it.effect("transport acceptance: duplicate active ID closes one client and cancels its stream", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ requestIds: [17] });
      const other = yield* owner.nextClient;
      const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
      yield* owner.firstAck;
      yield* owner.ingress({
        session: "document",
        client: owner.request().client,
        message: { _tag: "Request", id: 17, tag: "Echo", payload: { text: "duplicate" }, headers: [] },
      });
      const ended = yield* Fiber.await(watching);
      expect(Exit.isFailure(ended)).toBe(true);
      yield* owner.neverEnded;
      const result = yield* other.Echo({ text: "other logical client" });
      expect(result).toBe("other logical client");
    })
  )
);

for (const raw of ["{", "{}", '{"session":"document","client":0,"message":{"_tag":"Request","headers":42}}']) {
  it.effect(`transport acceptance: malformed ingress ${raw} retires its document and preserves another window`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* pair();
        yield* owner.client.Echo({ text: "initialize" });
        const other = yield* owner.nextWindow;
        owner.rawIngress(raw);
        yield* Effect.yieldNow;
        const result = yield* other.Echo({ text: "window survives" });
        expect(result).toBe("window survives");
        expect(owner.main.stats().executions).toBe(0);
      })
    )
  );
}

it.effect(
  "transport acceptance: malformed response closes its renderer document without affecting another window",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* pair();
        const other = yield* owner.nextWindow;
        const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
        yield* owner.firstAck;
        owner.rawResponse('{"session":"document","client":0,"message":{"_tag":"Exit","exit":null}}');
        const ended = yield* Fiber.await(watching);
        expect(Exit.isFailure(ended)).toBe(true);
        const result = yield* other.Echo({ text: "isolated" });
        expect(result).toBe("isolated");
        expect(owner.renderer.stats().workers).toBe(0);
      })
    )
);

it.effect("transport acceptance: discarded native call retains execution and pool after startup acknowledgement", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      yield* owner.client.Native(undefined, { discard: true });
      yield* owner.nativeStarted;
      expect(owner.main.stats().executions).toBe(1);
      expect(owner.main.stats().admission.appUnary).toBe(1);
      owner.disconnectMain();
      yield* owner.nativeEnded;
      yield* Effect.yieldNow;
      expect(owner.main.stats().admission.appNative).toBe(1);
      yield* owner.completeNative();
      expect(owner.main.stats().admission.appUnary).toBe(0);
    })
  )
);

it.effect("transport acceptance: Eof still admits forced Interrupt and drains a live stream", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ holdAck: true });
      const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
      yield* owner.firstAck;
      const request = owner.request();
      yield* owner.renderer.protocol.send(request.client, { _tag: "Eof" });
      yield* owner.main.terminate({ session: "document", ...request, error: failure("StreamOverflow") });
      const ended = yield* Fiber.await(watching);
      expect(Exit.isFailure(ended)).toBe(true);
      yield* owner.neverEnded;
      expect(owner.main.stats().executions).toBe(0);
    })
  )
);

it.effect("transport acceptance: actual interrupted sink is joined by its reserved control worker", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const entered = yield* Deferred.make<void>();
      const installed = yield* Deferred.make<void>();
      yield* owner.renderer.protocol
        .run(999, (message) =>
          message._tag === "Chunk"
            ? Effect.andThen(Deferred.succeed(entered, undefined), Effect.never)
            : message._tag === "Exit"
              ? Deferred.succeed(installed, undefined).pipe(Effect.asVoid)
              : Effect.void
        )
        .pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* owner.renderer.protocol.send(999, {
        _tag: "Request",
        id: "blocked",
        tag: "Never",
        headers: [],
        payload: null,
      });
      yield* Deferred.await(entered);
      yield* owner.main.terminate({
        session: "document",
        client: 999,
        requestId: "blocked",
        error: failure("StreamOverflow"),
      });
      yield* Deferred.await(installed);
      yield* owner.renderer.retired({ client: 999, requestId: "blocked" });
      yield* owner.neverEnded;
      expect(owner.renderer.stats().workers).toBe(0);
      expect(owner.renderer.stats().bytes).toBe(0);
    })
  )
);

it.effect("transport acceptance: binary base64 round trip and concurrent completion preserve values", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const bytes = new Uint8Array(1024 * 1024);
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
      const actual = yield* owner.client.Binary({ bytes });
      expect(actual).toEqual(bytes);
      const png = yield* S.decodeEffect(S.Uint8ArrayFromBase64)(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII="
      );
      const returnedPng = yield* owner.client.Binary({ bytes: png });
      expect(returnedPng).toEqual(png);
      expect(A.take(A.fromIterable(returnedPng), 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const results = yield* Effect.forEach(A.range(0, 63), (i) => owner.client.Echo({ text: i.toString() }), {
        concurrency: 16,
      });
      expect(results).toEqual(A.map(A.range(0, 63), (i) => i.toString()));
      expect(owner.main.stats().executions).toBe(0);
    })
  )
);

for (const discard of [false, true]) {
  it.effect(`transport acceptance: reserved namespace before first ordinary call, discard=${discard}`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* pair({ requestIds: ["@effect/rpc/notification/forbidden"] });
        const rejected = yield* Effect.exit(owner.client.Echo({ text: "forbidden" }, { discard }));
        expect(Exit.isFailure(rejected)).toBe(true);
        const other = yield* owner.nextClient;
        const result = yield* other.Echo({ text: "other" });
        expect(result).toBe("other");
        expect(owner.main.stats().executions).toBe(0);
      })
    )
  );
}

it.effect("publication ownership: registration snapshots are immutable and share the common account", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ledger = makeRetentionLedger();
      const resources = makeResourceBudget(ledger.forWindow("window"));
      let publish: (value: { nested: { value: number } }) => void = () => {};
      const owner = makeSubscriptions({
        identity: { document: "d", client: "c", generation: 0, epoch: "e" },
        resources,
        onTerminal: () => {},
      });
      const sub = yield* owner.acquire(
        "events",
        (receive) => {
          publish = receive;
        },
        (value: { nested: { value: number } }) => ({ value, bytes: 8 })
      );
      const value = { nested: { value: 1 } };
      publish(value);
      value.nested.value = 2;
      const items = yield* owner.watch(sub).pipe(Stream.take(2), Stream.runCollect);
      const item = items[1];
      expect(item?._tag).toBe("Observation");
      if (item?._tag === "Observation") {
        expect(item.value.nested.value).toBe(1);
        expect(Object.isFrozen(item.value.nested)).toBe(true);
      }
      expect(ledger.stats().data).toBe(4096);
      yield* sub.close;
      expect(ledger.stats().data).toBe(0);
    })
  )
);

it.effect(
  "publication ownership: capacity refusal happens before the snapshot factory and attempts source cleanup",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const ledger = makeRetentionLedger({ windowBytes: 4096 });
        const resources = makeResourceBudget(ledger.forWindow("window"));
        let captured = 0;
        let released = 0;
        const owner = makeSubscriptions({
          identity: { document: "d", client: "c", generation: 0, epoch: "e" },
          resources,
          onTerminal: () => {},
        });
        const result = yield* Effect.exit(
          owner.acquire(
            "events",
            (publish, own) => {
              own(() => {
                released++;
              });
              publish(1);
            },
            (value) => {
              captured++;
              return { value, bytes: 8 };
            }
          )
        );
        expect(Exit.isFailure(result)).toBe(true);
        expect(captured).toBe(0);
        expect(released).toBe(1);
        expect(ledger.stats().data).toBe(0);
      })
    )
);

it.effect("invocation ownership: per-client admission and retirement preserve another client's pending work", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const managed = yield* runtime;
      const ledger = makeRetentionLedger();
      const owner = makeInvocationOwner({
        runtime: managed,
        resources: makeResourceBudget(ledger.forWindow("window")),
      });
      let settled = 0;
      for (let index = 0; index < 257; index++)
        owner.invoke({
          client: 1,
          effect: Effect.never,
          settle: () => {
            settled++;
          },
        });
      owner.invoke({
        client: 2,
        effect: Effect.never,
        settle: () => {
          settled++;
        },
      });
      expect(settled).toBe(1);
      expect(owner.pending()).toBe(257);
      owner.retireClient(1);
      expect(settled).toBe(257);
      expect(owner.pending()).toBe(1);
      owner.close(() => {});
      expect(settled).toBe(258);
      expect(ledger.stats().data).toBe(0);
    })
  )
);

it.effect("transport failure atom: public registry publication is bounded and ignores departed owners", () =>
  Effect.gen(function* () {
    const registry = Registry.make();
    const owner = makeTransportFailureOwner(registry);
    const capacity = ElectronRpcCapacityError.make({
      resource: "buffered bytes",
      scope: "logical client",
      message: "BufferedCapacity",
    });
    owner.report(capacity);
    const current = registry.get(owner.atom);
    expect(current._tag).toBe("Some");
    if (current._tag === "Some") expect(current.value).toBe(capacity);
    owner.close();
    owner.report(ElectronRpcCapacityError.make({ resource: "frame bytes", scope: "document", message: "late" }));
    expect(registry.get(owner.atom)).toBe(current);
    registry.dispose();
    yield* Effect.void;
  })
);

it.effect(
  "document owner: permanent departure closes invocation, cut and repair accounting before registry disposal",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const managed = yield* runtime;
        const ledger = makeRetentionLedger();
        const owner = makeRendererDocumentOwner({
          runtime: managed,
          disposeRegistry: () => {},
          resources: makeResourceBudget(ledger.forWindow("window")),
        });
        const recovery = Result.getOrThrowWith(owner.recovery({ client: "c", family: "history" }), (error) => error);
        recovery.begin("epoch");
        recovery.touch("task");
        recovery.watermark({ id: "task", sequence: 1 });
        owner.delivery.applied({
          token: { document: "d", client: "c", generation: 0, family: "events", serial: 1 },
          epoch: "e",
          through: 1,
        });
        let settled = 0;
        owner.invoke({
          effect: Effect.never,
          settle: () => {
            settled++;
          },
        });
        owner.registerAuth({ callback: () => {}, retainedBytes: 256 });
        expect(ledger.stats().data).toBeGreaterThan(0);
        let disposed = 0;
        owner.close(() => {
          disposed++;
          expect(settled).toBe(1);
          expect(ledger.stats().data).toBe(0);
        });
        owner.close(() => {
          disposed++;
        });
        expect(disposed).toBe(1);
        expect(Result.isFailure(owner.recovery({ client: "new", family: "history" }))).toBe(true);
      })
    )
);

it.effect("retention ownership: zero-byte native reservations and cached handles cannot reset a window", () =>
  Effect.gen(function* () {
    const ledger = makeRetentionLedger({ windowBytes: 1024, appBytes: 2048 });
    const cached = ledger.forWindow("window");
    const first = cached.reserve(1);
    first?.release();
    ledger.connect("old", "window");
    const native = cached.reserve(0);
    ledger.disconnect("old");
    ledger.connect("new", "window");
    expect(native?.resize(900)).toBe(true);
    expect(ledger.document("new")?.reserve(125)).toBeUndefined();
    native?.release();
    const next = cached.reserve(900);
    expect(next).toBeDefined();
    expect(ledger.document("new")?.reserve(125)).toBeUndefined();
    next?.release();
    ledger.disconnect("new");
    expect(ledger.stats()).toMatchObject({ data: 0, leases: 0, windows: 0 });
    yield* Effect.void;
  })
);

it.effect("document layer: scope disposal retires its watermark budget", () =>
  Effect.gen(function* () {
    const ledger = makeRetentionLedger();
    const resources = makeResourceBudget(ledger.forWindow("window"));
    yield* Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(deliveryLayer).pipe(Effect.provideService(DocumentResources, resources));
        const owner = Context.get(context, DocumentDelivery);
        owner.applied({
          token: { document: "d", client: "c", generation: 0, family: "events", serial: 1 },
          epoch: "e",
          through: 1,
        });
        expect(ledger.stats().data).toBeGreaterThan(0);
      })
    );
    expect(ledger.stats().data).toBe(0);
  })
);

it.effect("auth publication: self-removal preserves subsequent synchronous prefixes and bounded ownership", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const managed = yield* runtime;
      const ledger = makeRetentionLedger();
      const owner = makeInvocationOwner({
        runtime: managed,
        resources: makeResourceBudget(ledger.forWindow("window")),
      });
      const trace: Array<string> = [];
      let removeA = () => {};
      removeA = Result.getOrThrowWith(
        owner.registerAuth({
          retainedBytes: 256,
          callback: () => {
            trace.push("A");
            removeA();
            owner.registerAuth({
              retainedBytes: 256,
              callback: () => {
                trace.push("C");
              },
            });
          },
        }),
        (error) => error
      );
      owner.registerAuth({
        retainedBytes: 256,
        callback: () => {
          trace.push("B");
        },
      });
      owner.emitAuth();
      expect(trace).toEqual(["A", "B", "C"]);
      expect(owner.callbackStats()).toEqual({ count: 2, bytes: 512 });
      owner.close(() => {});
      expect(ledger.stats().data).toBe(0);
    })
  )
);

it.effect("terminal accounting: nonenumerable Error.message is reserved before the actual exit encoder", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ holdAck: true });
      const other = yield* owner.nextClient;
      const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
      yield* owner.firstAck;
      yield* owner.main.terminate({
        session: "document",
        ...owner.request(),
        error: DeliveryError.make({ reason: "StreamOverflow", message: Str.repeat(65536)("x") }),
      });
      const stopped = yield* Fiber.await(watching);
      expect(Exit.isFailure(stopped)).toBe(true);
      yield* owner.neverEnded;
      expect(owner.terminalEncodes()).toBe(0);
      const result = yield* other.Echo({ text: "survives refusal" });
      expect(result).toBe("survives refusal");
    })
  )
);

it.effect("fix3 R3: idle malformed receive closes admission and fails subsequent calls", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const before = yield* owner.client.Echo({ text: "before" });
      expect(before).toBe("before");
      owner.rawResponse("malformed JSON");
      yield* Effect.yieldNow;
      const exit = yield* Effect.exit(owner.client.Echo({ text: "after" }).pipe(Effect.timeout("500 millis")));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).not.toContain("Timeout");
      const next = yield* Effect.exit(
        owner.nextClient.pipe(
          Effect.flatMap((client) => client.Echo({ text: "new" })),
          Effect.timeout("500 millis")
        )
      );
      expect(Exit.isFailure(next)).toBe(true);
      if (Exit.isFailure(next)) expect(Cause.pretty(next.cause)).not.toContain("Timeout");
      expect(owner.renderer.stats().workers).toBe(0);
    })
  )
);

it.effect("fix3 R2: registered forced terminal ends dependent cut before typed Exit and Eof drainage", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ holdAck: true, observeHeld: true });
      const registration =
        yield* Deferred.make<import("../src/renderer/src/transport/DocumentDelivery.model.js").Registered>();
      const watching = yield* owner.client.Observe().pipe(
        Stream.tap((event) => (event._tag === "Registered" ? Deferred.succeed(registration, event) : Effect.void)),
        Stream.runDrain,
        Effect.forkScoped
      );
      const registered = yield* Deferred.await(registration);
      owner.renderer.delivery.applied({ ...registered, through: 0 });
      const waiting = yield* owner.renderer.delivery.awaitCuts([{ ...registered, through: 1 }]).pipe(Effect.forkScoped);
      yield* owner.firstAck;
      const request = owner.request();
      yield* owner.ingress({ session: "document", client: request.client, message: { _tag: "Eof" } });
      yield* owner.main.terminate({ session: "document", ...request, error: failure("StreamOverflow") });
      const stream = yield* Fiber.await(watching);
      expect(Exit.isFailure(stream)).toBe(true);
      if (Exit.isFailure(stream)) {
        const error = Cause.squash(stream.cause);
        expect(S.is(DeliveryError)(error)).toBe(true);
        if (S.is(DeliveryError)(error)) expect(error.reason).toBe("StreamOverflow");
      }
      expect(owner.observeActive()).toBe(false);
      const cut = yield* Fiber.await(waiting).pipe(Effect.timeout("500 millis"));
      expect(Exit.isFailure(cut)).toBe(true);
      expect(owner.renderer.delivery.stats().pending).toBe(0);
      yield* owner.renderer.retired(request);
      expect(owner.renderer.stats().workers).toBe(0);
      yield* Effect.gen(function* () {
        while (owner.main.stats().clients !== 0) yield* Effect.yieldNow;
      }).pipe(Effect.timeout("500 millis"));
      expect(owner.main.stats().admission.appStreams).toBe(0);
    })
  )
);

it.effect("fix3 R4: application-scope interruption runs cleanup and settles both lifecycle signals", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    let bytes = 0;
    let cleanup = 0;
    const entered = yield* Deferred.make<void>();
    const operations = yield* makeOperations({
      reserve: (_, amount) => {
        bytes += amount;
        return true;
      },
      release: (_, amount) => {
        bytes -= amount;
      },
    }).pipe(Effect.provideService(Scope.Scope, scope));
    const handle = yield* operations.accept({
      originAccount: "window",
      reserveBytes: 1,
      run: Effect.fn("Fix3.interruptedOperation")(function* (handle: OperationHandle<unknown, unknown>) {
        yield* handle
          .registerCleanup(
            Effect.sync(() => {
              cleanup++;
            })
          )
          .pipe(Effect.orDie);
        yield* Deferred.succeed(entered, undefined);
        return yield* Effect.never;
      }),
    });
    yield* Deferred.await(entered);
    yield* Scope.close(scope, Exit.void);
    expect(cleanup).toBe(1);
    expect(bytes).toBe(0);
    yield* handle.released.pipe(Effect.timeout("200 millis"));
    const logical = yield* handle.logical;
    expect(Exit.isFailure(logical)).toBe(true);
  })
);

it.effect("fix3 R7: synchronous departure refuses acquisition and failed seventeenth release remains owned", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const managed = yield* runtime;
      const make = () =>
        makeSubscriptions({
          identity: { document: "doc", client: "c", generation: 0, epoch: "e" },
          onTerminal: () => {},
        });
      const owner = make();
      const departed = yield* Effect.exit(
        owner.acquire(
          "events",
          () => managed.runSync(owner.disconnect),
          (value: number) => ({ value, bytes: 8 })
        )
      );
      expect(Exit.isFailure(departed)).toBe(true);
      const overflow = make();
      const failed = yield* Effect.exit(
        overflow.acquire(
          "events",
          (_publish, own) => {
            for (let index = 0; index < 17; index++)
              own(
                index === 16 ? () => Result.getOrThrowWith(Result.fail(failure("CleanupFailed")), (e) => e) : () => {}
              );
          },
          (value: number) => ({ value, bytes: 8 })
        )
      );
      expect(Exit.isFailure(failed)).toBe(true);
      expect(overflow.stats().failedReleases).toBe(1);
      expect(overflow.stats().bytes).toBeGreaterThanOrEqual(256);
      expect(overflow.stats().cleanupCauses.length).toBeGreaterThan(0);
    })
  )
);

it.effect("fix3 R8: migrated construction and reporting defects cannot suppress later legacy recipients", () =>
  Effect.gen(function* () {
    for (const construction of [false, true]) {
      const trace: Array<number> = [];
      for (const value of [1, 2])
        yield* publishRecipient({
          value,
          legacy: (value) => {
            trace.push(value);
          },
          migrated: () =>
            construction
              ? Result.getOrThrowWith(Result.fail(failure("Construction")), (e) => e)
              : Effect.die("migrated"),
          report: () => Result.getOrThrowWith(Result.fail(failure("Reporter")), (e) => e),
        });
      expect(trace).toEqual([1, 2]);
    }
  })
);

it.effect(
  "fix3 R10: watermark exhaustion releases every lease and invocation closure cannot consume document disposal",
  () =>
    Effect.gen(function* () {
      const ledger = makeRetentionLedger();
      const resources = makeResourceBudget(ledger.forWindow("window"));
      const gate = makeDeliveryGate({ resources });
      for (let serial = 0; serial < 1025; serial++)
        gate.applied({
          token: { document: "d", client: "c", generation: 0, family: "f", serial },
          epoch: "e",
          through: 0,
        });
      gate.disconnect();
      expect(ledger.stats().data).toBe(0);
      const managed = yield* runtime;
      let disposed = 0;
      const owner = makeRendererDocumentOwner({
        runtime: managed,
        resources,
        disposeRegistry: () => {
          disposed++;
        },
      });
      const repair = owner.recovery({ client: "live", family: "f" });
      expect(Result.isSuccess(repair)).toBe(true);
      for (let id = 0; id < 65; id++) owner.retireClient({ id, tokenClient: `c${id}` });
      expect(disposed).toBe(1);
      owner.close(() => {
        disposed++;
      });
      owner.close(() => {
        disposed++;
      });
      expect(disposed).toBe(1);
      expect(ledger.stats().data).toBe(0);
    })
);

it.effect("fix3 R5: installed RpcClient never enters an expanding payload codec before allocation admission", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ledger = makeRetentionLedger({ windowBytes: 2000, appBytes: 2000 });
      let encodes = 0;
      const Expanded = S.String.pipe(
        S.decodeTo(S.String, {
          decode: Getter.passthrough(),
          encode: Getter.transform(() => {
            encodes++;
            return Str.repeat(4096)("x");
          }),
        }),
        $TransportId.annoteSchema("Expanded", { description: "Expanded boundary in the desktop transport contract." })
      );
      const group = RpcGroup.make(Rpc.make("Expand", { payload: { value: Expanded }, success: S.String }));
      const owner = yield* makeClientProtocol().pipe(
        Effect.provideService(DesktopRpcConnection, {
          session: "tiny",
          retention: ledger.forWindow("window"),
          listen: () => Effect.void,
          send: () => Effect.void,
        })
      );
      const client = yield* RpcClient.make(group).pipe(Effect.provideService(RpcClient.Protocol, owner.protocol));
      const exit = yield* Effect.exit(client.Expand({ value: "short" }).pipe(Effect.timeout("200 millis")));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(encodes).toBe(0);
      expect(owner.stats().workers).toBe(0);
    })
  )
);

it.effect("fix3 R6: promptly drained subscriptions release observations instead of exhausting lifetime traffic", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let publish: (value: number) => void = () => {};
      const owner = makeSubscriptions({
        identity: { document: "doc", client: "c", generation: 0, epoch: "e" },
        byteLimit: 12000,
        onTerminal: () => {},
      });
      const sub = yield* owner.acquire<number>(
        "events",
        (emit) => {
          publish = emit;
        },
        (value) => ({ value, bytes: 8 })
      );
      let received = 0;
      yield* owner.watch(sub).pipe(
        Stream.take(101),
        Stream.runForEach((_event) =>
          Effect.sync(() => {
            received++;
            if (received <= 100) publish(received);
          })
        )
      );
      expect(received).toBe(101);
      expect(owner.stats().bytes).toBe(0);
      yield* sub.close;
    })
  )
);

it.effect(
  "fix3 R6: consumed RPC values release physical and decoded storage under sustained traffic",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* pair();
        const text = Str.repeat(128 * 1024)("x");
        for (let index = 0; index < 128; index++) {
          const result = yield* owner.client.Echo({ text });
          expect(result).toBe(text);
        }
        let count = 0;
        yield* owner.renderer.consume(owner.client.Flood(), () =>
          Effect.sync(() => {
            count++;
          })
        );
        expect(count).toBe(1024);
        yield* Effect.yieldNow;
        expect(owner.main.stats().admission.appBytes).toBeLessThan(1024 * 1024);
      })
    ),
  { timeout: 20000 }
);

it.effect(
  "fix3 reviewer survivors: adapter Eof, duplicate and reserved guards precede admission and installed dispatch",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        for (const violation of ["eof", "duplicate", "reserved"]) {
          const owner = yield* pair();
          const watching = yield* owner.client.Never().pipe(Stream.runDrain, Effect.forkScoped);
          yield* owner.firstAck;
          const request = owner.request();
          if (violation === "eof") {
            yield* owner.ingress({ session: "document", client: request.client, message: { _tag: "Eof" } });
            yield* Effect.yieldNow;
          }
          const before = owner.boundaryStats();
          yield* owner.ingress({
            session: "document",
            client: request.client,
            message: {
              _tag: "Request",
              id:
                violation === "duplicate"
                  ? request.requestId
                  : violation === "reserved"
                    ? "@effect/rpc/notification/probe"
                    : "late",
              tag: "Echo",
              payload: { text: "forbidden" },
              headers: [],
            },
          });
          yield* Fiber.await(watching);
          expect(owner.boundaryStats()).toEqual(before);
        }
      })
    )
);

it.effect("fix3 reviewer survivors: application byte cap aggregates independent window accounts", () =>
  Effect.sync(() => {
    const ledger = makeRetentionLedger({ windowBytes: 4096, appBytes: 6000 });
    const first = ledger.forWindow("first").reserve(3500);
    expect(first).toBeDefined();
    expect(ledger.forWindow("second").reserve(3500)).toBeUndefined();
    expect(ledger.stats().data).toBe(3500);
    first?.release();
    const second = ledger.forWindow("second").reserve(3500);
    expect(second).toBeDefined();
    second?.release();
    expect(ledger.stats().data).toBe(0);
  })
);

it.effect("fix3 reviewer survivors: duplicate logical completion is refused without replacing the first result", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const attempted = yield* Deferred.make<Exit.Exit<void, DeliveryError>>();
      const operations = yield* makeOperations({ reserve: () => true, release: () => {} });
      const handle = yield* operations.accept<string, never>({
        originAccount: "window",
        reserveBytes: 1,
        run: Effect.fn("Fix3.duplicateCompletion")(function* (handle: OperationHandle<string, never>) {
          yield* handle.complete(Exit.succeed("first")).pipe(Effect.orDie);
          const duplicate = yield* Effect.exit(handle.complete(Exit.succeed("second")));
          yield* Deferred.succeed(attempted, duplicate);
        }),
      });
      const duplicate = yield* Deferred.await(attempted);
      expect(Exit.isFailure(duplicate)).toBe(true);
      yield* handle.released;
      const logical = yield* handle.logical;
      expect(logical).toEqual(Exit.succeed("first"));
    })
  )
);

it.effect("fix3 reviewer survivors: bigint wire text must be canonical", () =>
  Effect.gen(function* () {
    for (const v of ["01", "+1", "-0", "1.0", "1e0", " 1"]) {
      const decoded = yield* Effect.exit(S.decodeEffect(ObservedValue)({ t: "i", v }));
      expect(Exit.isFailure(decoded)).toBe(true);
    }
    const canonical = yield* S.decodeEffect(ObservedValue)({ t: "i", v: "1" });
    expect(canonical).toBe(1n);
  })
);

it.effect("fix3 R5: server codec refusal closes the owned client and never strands its caller", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const other = yield* owner.nextWindow;
      const stopped = yield* Effect.exit(
        owner.client.Echo({ text: "saturate codec arena" }).pipe(Effect.timeout("500 millis"))
      );
      expect(Exit.isFailure(stopped)).toBe(true);
      if (Exit.isFailure(stopped)) expect(Cause.pretty(stopped.cause)).not.toContain("Timeout");
      const alive = yield* other.Echo({ text: "other window" });
      expect(alive).toBe("other window");
    })
  )
);

it.effect(
  "fix3 R6: public client streams sustain traffic beyond the retention cap and release on drain",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* pair();
        let received = 0;
        yield* owner.client.Traffic().pipe(
          Stream.runForEach((value) =>
            Effect.sync(() => {
              expect(value.length).toBe(64 * 1024);
              received++;
            })
          )
        );
        expect(received).toBe(256);
        yield* Effect.yieldNow;
        expect(owner.main.stats().admission.appBytes).toBeLessThan(1024 * 1024);
        expect(owner.renderer.stats().workers).toBe(0);
      })
    ),
  { timeout: 20000 }
);

it.effect("fix3 R1: authenticated role policy refuses procedures before admission or handler dispatch", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair({ permit: (tag) => tag !== "Echo" });
      const other = yield* owner.nextWindow;
      const refused = yield* Effect.exit(owner.client.Echo({ text: "capture cannot invoke visible procedure" }));
      expect(Exit.isFailure(refused)).toBe(true);
      expect(owner.boundaryStats()).toEqual({ admissionAttempts: 0, dispatchedRequests: 0 });
      const alive = yield* other.Echo({ text: "visible" });
      expect(alive).toBe("visible");
    })
  )
);

it.effect("fix4 R1: DocumentClosed irreversibly rejects fresh calls with separate process ledgers", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const first = yield* owner.client.Echo({ text: "before" });
      expect(first).toBe("before");
      owner.rawIngress("malformed main input");
      yield* Effect.yieldNow;
      for (const call of [
        owner.client.Echo({ text: "existing" }),
        owner.nextClient.pipe(Effect.flatMap((client) => client.Echo({ text: "fresh" }))),
      ]) {
        const running = yield* call.pipe(Effect.exit, Effect.forkScoped);
        for (let turn = 0; turn < 16; turn++) yield* Effect.yieldNow;
        expect(running.pollUnsafe()).toBeDefined();
        const exit = yield* Fiber.join(running);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit))
          expect(
            S.is(S.Struct({ reason: S.Struct({ cause: ElectronRpcTransportError }) }))(Cause.squash(exit.cause))
          ).toBe(true);
      }
      for (
        let turn = 0;
        turn < 128 && (owner.renderer.stats().workers !== 0 || owner.renderer.stats().clients !== 0);
        turn++
      )
        yield* Effect.yieldNow;
      expect(owner.renderer.stats().workers).toBe(0);
      expect(owner.renderer.stats().clients).toBe(0);
      expect(owner.renderer.delivery.stats()).toEqual({ tokens: 0, pending: 0 });
      expect(owner.rendererLedger.stats().data).toBe(0);
    })
  )
);

it.effect("fix4 R2: accepted but never-started operation settles on immediate application closure", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    let bytes = 0;
    let entered = 0;
    const owner = yield* makeOperations({
      reserve: (_, amount) => {
        bytes += amount;
        return true;
      },
      release: (_, amount) => {
        bytes -= amount;
      },
    }).pipe(Effect.provideService(Scope.Scope, scope));
    const handle = yield* owner.accept({
      originAccount: "window",
      reserveBytes: 1,
      run: () =>
        Effect.sync(() => {
          entered++;
        }),
    });
    yield* Scope.close(scope, Exit.void);
    expect(entered).toBe(0);
    expect(bytes).toBe(0);
    const logical = yield* handle.logical.pipe(Effect.timeout("200 millis"));
    expect(Exit.isFailure(logical)).toBe(true);
    yield* handle.released.pipe(Effect.timeout("200 millis"));
  })
);

it.effect("fix4 R3: source chunks keep every queued and borrowed charge through blocked consumption and closure", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ledger = makeRetentionLedger();
      const owner = makeSubscriptions({
        identity: { document: "d", client: "c", generation: 1, epoch: "e" },
        resources: makeResourceBudget(ledger.forWindow("window")),
        onTerminal: () => {},
      });
      const sub = yield* owner.acquire<string>(
        "events",
        (publish) => {
          publish(Str.repeat(1000)("a"));
          publish(Str.repeat(1000)("b"));
          publish(Str.repeat(1000)("c"));
        },
        (value) => ({ value, bytes: 1 })
      );
      const all = owner.stats().bytes;
      const entered = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      let during = 0;
      let borrowed = 0;
      const consumer = yield* owner.watch(sub).pipe(
        Stream.filter((event) => event._tag === "Observation"),
        Stream.take(1),
        Stream.runForEach(() =>
          Effect.gen(function* () {
            during = owner.stats().bytes;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(resume);
          })
        ),
        Effect.forkScoped
      );
      yield* Deferred.await(entered);
      expect(during).toBe(all);
      yield* sub.close;
      borrowed = owner.stats().bytes;
      expect(borrowed).toBeGreaterThan(0);
      expect(borrowed).toBe(all / 3);
      expect(ledger.stats().data).toBeGreaterThanOrEqual(borrowed);
      yield* Deferred.succeed(resume, undefined);
      yield* Fiber.join(consumer);
      expect(owner.stats().bytes).toBe(0);
      expect(ledger.stats().data).toBe(0);
    })
  )
);

it.effect("fix4 R4: cleanup reported after synchronous departure is released or retained with its actual cause", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const managed = yield* runtime;
      for (const fails of [false, true]) {
        let releases = 0;
        const original = failure("LateCleanupFailed");
        const owner = makeSubscriptions({
          identity: { document: "d", client: "c", generation: 1, epoch: "e" },
          onTerminal: () => {},
        });
        const acquired = yield* Effect.exit(
          owner.acquire<number>(
            "events",
            (_publish, own) => {
              managed.runSync(owner.disconnect);
              own(() => {
                releases++;
                if (fails) Result.getOrThrowWith(Result.fail(original), (error) => error);
              });
            },
            (value) => ({ value, bytes: 8 })
          )
        );
        expect(Exit.isFailure(acquired)).toBe(true);
        expect(releases).toBe(1);
        expect(owner.stats().failedReleases).toBe(fails ? 1 : 0);
        expect(owner.stats().bytes).toBe(fails ? 256 : 0);
        expect(owner.stats().cleanupCauses.length).toBe(fails ? 1 : 0);
        for (const cause of owner.stats().cleanupCauses) {
          expect(Cause.isCause(cause)).toBe(true);
          if (Cause.isCause(cause)) expect(Cause.squash(cause)).toBe(original);
        }
      }
    })
  )
);

it.effect("fix4 survivor: frame transfer and chunk ownership outlive the last blocked consumer", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const last = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      const consumer = yield* owner.client.Flood().pipe(
        Stream.runForEach((value) =>
          value === 1023 ? Effect.andThen(Deferred.succeed(last, undefined), Deferred.await(resume)) : Effect.void
        ),
        Effect.forkScoped
      );
      yield* Deferred.await(last);
      yield* Effect.gen(function* () {
        while (
          owner.renderer.stats().workers !== 0 ||
          owner.main.stats().executions !== 0 ||
          owner.storageStats().exitStorage === undefined
        )
          yield* Effect.yieldNow;
        const exit = owner.storageStats().exitStorage;
        while (
          !A.some(owner.storageStats().released, (id) => id === exit) ||
          owner.main.stats().completedFrames < owner.storageStats().sentMainFrames
        )
          yield* Effect.yieldNow;
      }).pipe(Effect.timeout("500 millis"));
      expect(owner.renderer.stats().bytes).toBe(0);
      const chunk = owner.storageStats().chunkStorage;
      expect(chunk).toBeDefined();
      expect(A.some(owner.storageStats().released, (id) => id === chunk)).toBe(false);
      expect(owner.rendererLedger.stats().data).toBeGreaterThan(0);
      expect(owner.main.stats().admission.appBytes).toBeGreaterThan(0);
      yield* Deferred.succeed(resume, undefined);
      yield* Fiber.join(consumer);
      yield* Effect.gen(function* () {
        while (!A.some(owner.storageStats().released, (id) => id === chunk)) yield* Effect.yieldNow;
      }).pipe(Effect.timeout("500 millis"));
      expect(A.filter(owner.storageStats().released, (id) => id === chunk).length).toBe(1);
      expect(owner.rendererLedger.stats().data).toBe(0);
    })
  )
);

it.effect("fix4 survivor: ordinary Exit ends registration and fails a later unsatisfied cut", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* pair();
      const ready =
        yield* Deferred.make<import("../src/renderer/src/transport/DocumentDelivery.model.js").Registered>();
      yield* owner.client.Observe().pipe(
        Stream.tap((event) => (event._tag === "Registered" ? Deferred.succeed(ready, event) : Effect.void)),
        Stream.runDrain
      );
      const registered = yield* Deferred.await(ready);
      const waiting = yield* owner.renderer.delivery
        .awaitCuts([{ ...registered, through: 3 }])
        .pipe(Effect.exit, Effect.forkScoped);
      yield* Effect.yieldNow;
      expect(owner.renderer.delivery.stats().pending).toBe(0);
      expect(waiting.pollUnsafe()).toBeDefined();
      const exit = yield* Fiber.join(waiting);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause);
        expect(S.is(DeliveryError)(error)).toBe(true);
        if (S.is(DeliveryError)(error)) expect(error.reason).toBe("DeliveryLost");
      }
      expect(owner.renderer.delivery.stats().pending).toBe(0);
    })
  )
);

it.effect("fix4 survivor: abandoned encoded staging is released by fiber exit without owner close", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const ledger = makeRetentionLedger();
      const owner = makeCodecOwnership({ account: () => ledger.forWindow("w") });
      let during = 0;
      const encoded = S.encodeEffect(owner.codecFor(S.String))(Str.repeat(4096)("x"));
      const worker = yield* encoded.pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            during = ledger.stats().data;
          })
        ),
        Effect.asVoid,
        Effect.forkScoped
      );
      yield* Fiber.join(worker);
      yield* Effect.yieldNow;
      expect(during).toBeGreaterThan(0);
      expect(ledger.stats().data).toBe(0);
      expect(ledger.stats().leases).toBe(0);
      owner.close();
    })
  )
);

it.effect("fix4 survivor: operation is sealed during cleanup and remains sealed after release", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let bytes = 0;
      const operations = yield* makeOperations({
        reserve: (_, amount) => {
          bytes += amount;
          return true;
        },
        release: (_, amount) => {
          bytes -= amount;
        },
      });
      const checked = yield* Deferred.make<ReadonlyArray<Exit.Exit<void, DeliveryError>>>();
      const handle = yield* operations.accept<string, never>({
        originAccount: "w",
        reserveBytes: 1,
        run: Effect.fn("Fix4.sealing")(function* (handle: OperationHandle<string, never>) {
          yield* handle.registerCleanup(
            Effect.gen(function* () {
              const grow = yield* Effect.exit(handle.grow(1));
              const register = yield* Effect.exit(handle.registerCleanup(Effect.void));
              const complete = yield* Effect.exit(handle.complete(Exit.succeed("late")));
              yield* Deferred.succeed(checked, [grow, register, complete]);
            })
          );
          yield* handle.complete(Exit.succeed("first"));
        }, Effect.orDie),
      });
      const during = yield* Deferred.await(checked);
      expect(A.every(during, Exit.isFailure)).toBe(true);
      yield* handle.released;
      for (const effect of [
        handle.grow(1),
        handle.registerCleanup(Effect.void),
        handle.complete(Exit.succeed("late")),
      ]) {
        const exit = yield* Effect.exit(effect);
        expect(Exit.isFailure(exit)).toBe(true);
      }
      expect(bytes).toBe(0);
    })
  )
);

it.effect("fix4 R2: application closure during suspended cleanup waits for native release", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      let bytes = 0;
      let released = 0;
      const entered = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      const owner = yield* makeOperations({
        reserve: (_, amount) => {
          bytes += amount;
          return true;
        },
        release: (_, amount) => {
          bytes -= amount;
        },
      }).pipe(Effect.provideService(Scope.Scope, scope));
      const handle = yield* owner.accept({
        originAccount: "window",
        reserveBytes: 1,
        run: Effect.fn("Fix4.suspendedCleanup")(function* (handle: OperationHandle<unknown, unknown>) {
          yield* handle.registerCleanup(
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(resume);
              released++;
            })
          );
          yield* handle.complete(Exit.succeed("done"));
        }, Effect.orDie),
      });
      yield* Deferred.await(entered);
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      expect(bytes).toBeGreaterThan(0);
      expect(released).toBe(0);
      yield* Deferred.succeed(resume, undefined);
      yield* Fiber.join(closing);
      expect(released).toBe(1);
      expect(bytes).toBe(0);
      yield* handle.released;
    })
  )
);
