import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { DesktopRpcs } from "../../../shared/Desktop.rpc.js";
import { ElectronRpcTransportError } from "../transport/DocumentDelivery.errors.js";
import { DesktopRpcClient } from "../transport/ElectronRpcClient.layer.js";
import { FoundationFailures } from "./FoundationFailures.service.js";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import type { DesktopOperationError } from "../../../shared/DesktopOperation.errors.js";
import type { SettingsError } from "../../../shared/Settings.errors.js";
import type { DeliveryError } from "../transport/DocumentDelivery.errors.js";
import type { Token } from "../transport/DocumentDelivery.model.js";

const make = Effect.gen(function* () {
  const transport = yield* DesktopRpcClient;
  const failures = yield* FoundationFailures;
  const client = yield* transport.makeClient(DesktopRpcs);
  const scope = yield* Scope.Scope;
  let settings: Deferred.Deferred<Token, DeliveryError | SettingsError | RpcClientError> | undefined;
  let kernel: Deferred.Deferred<Token, DeliveryError | DesktopOperationError | RpcClientError> | undefined;
  const startSettings = Effect.fn("FoundationClient.settings")(function* (invalidate: () => void) {
    if (settings !== undefined) return yield* Deferred.await(settings);
    const ready = Deferred.makeUnsafe<Token, DeliveryError | SettingsError | RpcClientError>();
    settings = ready;
    yield* Effect.forkIn(
      transport
        .consume(client["Settings.WatchChanged"](), (event) =>
          Effect.gen(function* () {
            if (event._tag === "Registered") {
              transport.delivery.applied({ ...event, through: 0 });
              yield* Deferred.succeed(ready, event.token);
            } else {
              yield* Effect.sync(invalidate);
              transport.delivery.applied({ token: event.token, epoch: event.epoch, through: event.sequence });
            }
          })
        )
        .pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Deferred.failCause(ready, cause);
              if (!Cause.hasInterruptsOnly(cause))
                yield* Effect.sync(() =>
                  failures.report(
                    ElectronRpcTransportError.make({
                      operation: "Settings.WatchChanged",
                      reason: "SourceClosed",
                      message: "Desktop source connection closed",
                    })
                  )
                );
            })
          ),
          Effect.ensuring(
            Effect.sync(() => {
              if (settings === ready) settings = undefined;
            })
          )
        ),
      scope
    );
    return yield* Deferred.await(ready);
  });
  const startKernel = Effect.fn("FoundationClient.kernel")(function* (
    update: (value: import("../../../shared/types/ytdlp-kernel.js").YtDlpKernelStatus) => void
  ) {
    if (kernel !== undefined) return yield* Deferred.await(kernel);
    const ready = Deferred.makeUnsafe<Token, DeliveryError | DesktopOperationError | RpcClientError>();
    kernel = ready;
    yield* Effect.forkIn(
      transport
        .consume(client["App.WatchYtDlpKernelStatus"](), (event) =>
          Effect.gen(function* () {
            if (event._tag === "Registered") {
              transport.delivery.applied({ ...event, through: 0 });
              yield* Deferred.succeed(ready, event.token);
            } else {
              yield* Effect.sync(() => update(event.value));
              transport.delivery.applied({ token: event.token, epoch: event.epoch, through: event.sequence });
            }
          })
        )
        .pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Deferred.failCause(ready, cause);
              if (!Cause.hasInterruptsOnly(cause))
                yield* Effect.sync(() =>
                  failures.report(
                    ElectronRpcTransportError.make({
                      operation: "App.WatchYtDlpKernelStatus",
                      reason: "SourceClosed",
                      message: "Desktop source connection closed",
                    })
                  )
                );
            })
          ),
          Effect.ensuring(
            Effect.sync(() => {
              if (kernel === ready) kernel = undefined;
            })
          )
        ),
      scope
    );
    return yield* Deferred.await(ready);
  });
  return { client, transport, startSettings, startKernel, report: failures.report };
});
/** One foundation client per document graph; all three groups share its authenticated transport and delivery gate. Registration is observed before dependent snapshot calls begin.
 * **Example** (Read the client factory from the document graph)
 * ```ts
 * import { FoundationClient } from './FoundationClient.service.js'
 * export const version=FoundationClient.use(owner=>owner.client['App.GetVersion']())
 * // Supply the document layer; the result is a Completion whose cuts must be awaited.
 * ```
 * @category services
 * @since 0.0.0
 */
export class FoundationClient extends Context.Service<FoundationClient, Effect.Success<typeof make>>()(
  "vidbee/renderer/src/runtime/FoundationClient.service/FoundationClient"
) {}
/** Acquires the foundation client in the document scope and retains its stream workers until that document closes.
 * **Example** (Build with the document protocol)
 * ```ts
 * import { FoundationClientLive } from './FoundationClient.service.js'
 * import * as Layer from 'effect/Layer'
 * export const acquire=Layer.build(FoundationClientLive)
 * // Supply DesktopRpcClient and a document scope.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const FoundationClientLive = Layer.effect(FoundationClient)(make);
