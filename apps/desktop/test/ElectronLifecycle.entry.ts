import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as S from "effect/Schema";
import * as Stream from "effect/Stream";
import { ElectronRpcAdmission, makeAdmission } from "../src/main/ipc/ElectronRpcAdmission.service.js";
import { ElectronRpcWire, makeServerProtocol } from "../src/main/ipc/ElectronRpcServer.layer.js";
import { DeliveryError, failure } from "../src/renderer/src/transport/DocumentDelivery.errors.js";
import { nativeHarness } from "./ElectronLifecycle.driver.js";

const Echo = Rpc.make("Echo", { success: S.Int, error: DeliveryError });
const Watch = Rpc.make("Watch", { success: S.Int, error: DeliveryError, stream: true });
const Rpcs = RpcGroup.make(Echo, Watch);
const program = Effect.scoped(
  Effect.gen(function* () {
    const native = yield* nativeHarness();
    const owner = yield* makeServerProtocol({
      isStream: (tag) => tag === "Watch",
      encodeFailure: (_, error) =>
        S.encodeEffect(RpcSerialization.json.codecFor(Rpc.exitSchema(Watch)))(error.pipe(Exit.fail)).pipe(
          Effect.mapError(() => failure("EncodingFailed"))
        ),
    }).pipe(
      Effect.provideService(ElectronRpcWire, native.wire),
      Effect.provideService(ElectronRpcAdmission, makeAdmission())
    );
    let ended = Deferred.makeUnsafe<void>();
    const handlers = yield* Layer.build(
      Rpcs.toLayer({
        Echo: () => Effect.succeed(42),
        Watch: () =>
          Stream.concat(Stream.make(1), Stream.never).pipe(Stream.ensuring(Deferred.succeed(ended, undefined))),
      })
    );
    yield* RpcServer.make(Rpcs, { disableFatalDefects: true, onRequest: owner.onRequest }).pipe(
      Effect.provideContext(handlers),
      Effect.provideService(RpcServer.Protocol, owner.protocol),
      Effect.forkScoped
    );
    const first = yield* native.open();
    const other = yield* native.open();
    const original = yield* first.connect;
    const independent = yield* other.connect;
    yield* first.exchange({
      session: original.session,
      client: 0,
      message: { _tag: "Request", id: 1, tag: "Watch", payload: null, headers: [] },
    });
    yield* first.reload;
    yield* Deferred.await(ended);
    const reloaded = yield* first.connect;
    if (reloaded.session === original.session) return yield* Effect.die("reload reused generation");
    ended = Deferred.makeUnsafe<void>();
    yield* first.exchange({
      session: reloaded.session,
      client: 0,
      message: { _tag: "Request", id: 2, tag: "Watch", payload: null, headers: [] },
    });
    yield* first.crash;
    yield* Deferred.await(ended);
    const alive = yield* other.exchange({
      session: independent.session,
      client: 0,
      message: { _tag: "Request", id: 3, tag: "Echo", payload: null, headers: [] },
    });
    if (alive.message._tag !== "Exit" || alive.message.exit._tag !== "Success" || alive.message.exit.value !== 42)
      return yield* Effect.die("other window lost");
    yield* first.load;
    const recovered = yield* first.connect;
    if (recovered.session === reloaded.session) return yield* Effect.die("crash reused generation");
    const react = yield* first.react;
    const proof = yield* S.decodeUnknownEffect(
      S.Struct({
        setups: S.Int,
        cleanups: S.Int,
        sameRegistry: S.Boolean,
        actualDisposals: S.Int,
        pendingAtDispose: S.Int,
        staleWrites: S.Int,
        authAfterClose: S.Int,
        unsubscribeRemovals: S.Int,
      })
    )(react);
    if (
      proof.setups !== 2 ||
      proof.actualDisposals !== 1 ||
      !proof.sameRegistry ||
      proof.pendingAtDispose !== 0 ||
      proof.staleWrites !== 0 ||
      proof.authAfterClose !== 0 ||
      proof.unsubscribeRemovals !== 1
    )
      return yield* Effect.die("React lifecycle mismatch");
    yield* Effect.log("TRANSPORT_REACT_LIFECYCLE_PASS", proof);
    yield* Effect.log(
      "TRANSPORT_ELECTRON_LIFECYCLE_PASS reload crash other-window generation retirement React StrictMode provider HMR"
    );
    return yield* Effect.never;
  })
);
Effect.runFork(
  program.pipe(
    Effect.catchCause((cause) =>
      Effect.andThen(Effect.logError("TRANSPORT_ELECTRON_LIFECYCLE_FAIL", Cause.pretty(cause)), Effect.never)
    )
  )
);
