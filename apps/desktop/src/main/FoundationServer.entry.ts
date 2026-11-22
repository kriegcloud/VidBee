import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcSchema from "effect/rpc/RpcSchema";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as S from "effect/Schema";
import { failure } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { DesktopRpcs } from "../shared/Desktop.rpc.js";
import { makeFoundationHandlers } from "./FoundationHandlers.layer.js";
import { ElectronRpcAdmission } from "./ipc/ElectronRpcAdmission.service.js";
import { ElectronRpcServer, ElectronRpcWire, makeServerProtocol } from "./ipc/ElectronRpcServer.layer.js";

/** Starts one scoped foundation server on the supplied native wire, using the application's existing admission ledger and services. Ready runs only after the protocol and handler workers are installed; interrupt this effect during owned shutdown.
 * **Example** (Create the bootstrap Effect)
 * ```ts
 * import { runFoundationServer } from './FoundationServer.entry.js'
 * export const start=(options:Parameters<typeof runFoundationServer>[0])=>runFoundationServer(options)
 * // Provide the shared application service graph and fork once before creating renderer windows.
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const runFoundationServer = Effect.fn("FoundationServer.run")(function* (options: {
  readonly wire: ElectronRpcWire["Service"];
  readonly admission: ElectronRpcAdmission["Service"];
  readonly handlers: Parameters<typeof makeFoundationHandlers>[0];
  readonly ready: () => void;
}) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* makeServerProtocol({
        isStream: (tag) => {
          const rpc = DesktopRpcs.requests.get(tag);
          return rpc !== undefined && RpcSchema.isStreamSchema(rpc.successSchema);
        },
        encodeFailure: (tag, error) => {
          const rpc = DesktopRpcs.requests.get(tag);
          if (rpc === undefined) return Effect.fail(failure("UnknownProcedure"));
          return S.encodeEffect(RpcSerialization.json.codecFor(Rpc.exitSchema(rpc)))(error.pipe(Exit.fail)).pipe(
            Effect.mapError(() => failure("EncodeFailed"))
          );
        },
      });
      const handlers = yield* Layer.build(
        makeFoundationHandlers(options.handlers).pipe(Layer.provide(Layer.succeed(ElectronRpcServer, server)))
      );
      yield* Effect.forkScoped(
        RpcServer.make(DesktopRpcs, { disableFatalDefects: true, onRequest: server.onRequest }).pipe(
          Effect.provideContext(handlers),
          Effect.provideService(RpcServer.Protocol, server.protocol)
        )
      );
      yield* Effect.sync(options.ready);
      return yield* Effect.never;
    })
  ).pipe(
    Effect.provideService(ElectronRpcWire, options.wire),
    Effect.provideService(ElectronRpcAdmission, options.admission)
  );
});
