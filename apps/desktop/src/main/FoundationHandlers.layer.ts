import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { DeliveryError, failure } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { measureValue } from "../renderer/src/transport/ElectronRpc.model.js";
import { DesktopRpcs } from "../shared/Desktop.rpc.js";
import { DesktopOperationError } from "../shared/DesktopOperation.errors.js";
import { SettingsDecodeError, SettingsReadError, SettingsWriteError } from "../shared/Settings.errors.js";
import { DesktopApp } from "./App.service.js";
import { makeFoundationStreams } from "./FoundationStreams.service.js";
import { ElectronRpcAdmission } from "./ipc/ElectronRpcAdmission.service.js";
import { ElectronRpcServer } from "./ipc/ElectronRpcServer.layer.js";
import { ApplicationOperations } from "./runtime/ApplicationOperations.service.js";
import { DesktopSettings } from "./Settings.service.js";
import { makeSettingsApplication } from "./SettingsApplication.service.js";
import { DesktopWindow } from "./Window.service.js";
import type { Token } from "../renderer/src/transport/DocumentDelivery.model.js";
import type { RetentionLease } from "../renderer/src/transport/ElectronRpc.model.js";
import type { makeFoundationEvents } from "./FoundationEvents.service.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { SettingsApplicationPrimitives } from "./SettingsApplication.service.js";

/** Mountable handlers use the same application services as old invoke forwarders. Dependency bindings capture exact subscription incarnations before reading or starting native work; native workers belong to the application owner until actual completion.
 * **Example** (Construct the handler layer at bootstrap)
 * ```ts
 * import { makeFoundationHandlers } from './FoundationHandlers.layer.js'
 * export const handlers=(options:Parameters<typeof makeFoundationHandlers>[0])=>makeFoundationHandlers(options)
 * // Provide the three application services, ElectronRpcServer and ApplicationOperations once.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const makeFoundationHandlers = ({
  events,
  settingsNative,
  epoch,
}: {
  readonly events: ReturnType<typeof makeFoundationEvents>;
  readonly epoch: string;
  readonly settingsNative: (entries: ReadonlyArray<readonly [string, unknown]>) => SettingsApplicationPrimitives;
}) =>
  DesktopRpcs.toLayer(
    Effect.gen(function* () {
      const server = yield* ElectronRpcServer;
      const admission = yield* ElectronRpcAdmission;
      const settings = yield* DesktopSettings;
      const app = yield* DesktopApp;
      const window = yield* DesktopWindow;
      const operations = yield* ApplicationOperations;
      const streams = makeFoundationStreams({ server, events, epoch });
      const callEffect = <A, E>(body: (call: SynchronousCall) => Effect.Effect<A, E>) =>
        Effect.suspend(() => {
          let active = true;
          const releases: Array<() => void> = [];
          const call: SynchronousCall = {
            use: (body) => {
              if (!active) throw DeliveryError.make({ reason: "NativeCallRevoked", message: "Native call revoked" });
              return body();
            },
            cleanup: (release) => {
              releases.push(release);
            },
          };
          return body(call).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                active = false;
                for (const release of releases) release();
              })
            )
          );
        });
      const complete = Effect.fn("Foundation.complete")(function* <A, E>(
        effect: Effect.Effect<A, E>,
        bound?: {
          readonly capture: Effect.Effect<
            ReadonlyArray<import("../renderer/src/transport/DocumentDelivery.model.js").Cut>,
            import("../renderer/src/transport/DocumentDelivery.errors.js").DeliveryError
          >;
        }
      ) {
        const result = yield* Effect.result(effect);
        const cuts = bound === undefined ? [] : yield* bound.capture;
        return {
          exit: Result.isSuccess(result)
            ? ({ _tag: "Success", value: result.success } satisfies { readonly _tag: "Success"; readonly value: A })
            : ({ _tag: "Failure", error: result.failure } satisfies { readonly _tag: "Failure"; readonly error: E }),
          cuts,
        };
      });
      const readError = (error: OriginalFailure | SettingsDecodeError) =>
        S.is(SettingsDecodeError)(error)
          ? error
          : SettingsReadError.make({ operation: error.operation, message: error.legacyMessage });
      const writeError = (error: OriginalFailure) =>
        SettingsWriteError.make({ operation: error.operation, message: error.legacyMessage });
      const nativeError = (error: OriginalFailure) =>
        DesktopOperationError.make({ operation: error.operation, message: error.legacyMessage });
      const native = Effect.fn("Foundation.native")(function* <A, E>(
        headers: Readonly<Record<string, string>>,
        body: (
          call: SynchronousCall,
          retention: { readonly reserve: (bytes: number) => boolean }
        ) => Effect.Effect<A, E>,
        bound?: Parameters<typeof complete>[1],
        reserveBytes = 4096
      ) {
        const lease = yield* server.requestLease(headers);
        let alive = true;
        let output: RetentionLease | undefined;
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            alive = false;
            output?.release();
            output = undefined;
          })
        );
        const originAccount = Str.split(lease.request.session, "/")[0] ?? "";
        const budget = admission.ledger.forWindow(originAccount);
        let raster: RetentionLease | undefined;
        let rasterOpen = true;
        let capacityRefused = false;
        const retain = {
          reserve: (bytes: number) => {
            if (!rasterOpen || !Number.isSafeInteger(bytes) || bytes < 0) {
              capacityRefused = true;
              return false;
            }
            if (raster !== undefined) {
              const resized = raster.resize(bytes);
              if (!resized) capacityRefused = true;
              return resized;
            }
            raster = budget.reserve(bytes);
            if (raster === undefined) capacityRefused = true;
            return raster !== undefined;
          },
        };
        const handle = yield* operations.accept<Result.Result<A, E>, DeliveryError>({
          originAccount,
          reserveBytes,
          run: Effect.fn("Foundation.native.run")(function* (handle) {
            yield* handle
              .registerCleanup(
                Effect.sync(() => {
                  rasterOpen = false;
                  raster?.release();
                  raster = undefined;
                })
              )
              .pipe(Effect.orDie);
            const result = yield* Effect.result(callEffect((call) => body(call, retain)).pipe(Effect.uninterruptible));
            if (capacityRefused) {
              yield* handle.complete(Exit.fail(failure("NativeCapacity"))).pipe(Effect.ignore);
              return;
            }
            // The receiving request reserves output before the application worker
            // relinquishes its native reservation. A departed request retains no result copy.
            if (alive) {
              const bytes = measureValue(Result.isSuccess(result) ? result.success : result.failure);
              output = lease.resources.account.reserve(bytes ?? 64 * 1024 * 1024);
              if (output === undefined) {
                yield* handle.complete(Exit.fail(failure("NativeOutputCapacity"))).pipe(Effect.ignore);
                return;
              }
            }
            yield* handle.complete(Exit.succeed(result)).pipe(Effect.ignore);
          }),
        });
        const exit = yield* handle.logical;
        // Output already belongs to the request account. Wait for actual native
        // completion/cleanup before the encoder acquires its conservative arena.
        yield* handle.released;
        if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
        return yield* complete(Effect.fromResult(exit.value), bound);
      });
      const dependent = Effect.fn("Foundation.dependent")(function* (
        headers: Readonly<Record<string, string>>,
        token: Token,
        family: "settings" | "kernel"
      ) {
        const lease = yield* server.requestLease(headers);
        return yield* streams.bind(lease, token, family);
      });
      return DesktopRpcs.of({
        "Settings.Get": Effect.fn("Settings.Get")(function* ({ key, settings: token }, options) {
          const bound = yield* dependent(options.headers, token, "settings");
          return yield* complete(
            callEffect((call) => settings.forCall(call).getTyped(key)).pipe(Effect.mapError(readError)),
            bound
          );
        }),
        "Settings.GetAll": Effect.fn("Settings.GetAll")(function* ({ settings: token }, options) {
          const bound = yield* dependent(options.headers, token, "settings");
          return yield* complete(
            callEffect((call) => settings.forCall(call).view).pipe(Effect.mapError(readError)),
            bound
          );
        }),
        "Settings.Set": (update) =>
          complete(
            callEffect(
              (call) =>
                makeSettingsApplication({
                  settings: settings.forCall(call),
                  call,
                  native: settingsNative([[update.key, update.value]]),
                }).update
            ).pipe(Effect.as(undefined), Effect.mapError(writeError))
          ),
        "Settings.SetAll": ({ settings: updates }) =>
          complete(
            callEffect(
              (call) =>
                makeSettingsApplication({
                  settings: settings.forCall(call),
                  call,
                  native: settingsNative(
                    A.map(updates, (update) => [update.key, update.value] satisfies readonly [string, unknown])
                  ),
                }).update
            ).pipe(Effect.as(undefined), Effect.mapError(writeError))
          ),
        "Settings.Reset": () =>
          complete(
            callEffect(
              (call) =>
                makeSettingsApplication({ settings: settings.forCall(call), call, native: settingsNative([]) }).reset
            ).pipe(Effect.as(undefined), Effect.mapError(writeError))
          ),
        "Settings.ShouldPromptWhatsNew": () =>
          complete(callEffect((call) => settings.forCall(call).shouldPromptWhatsNew).pipe(Effect.mapError(readError))),
        "Settings.MarkWhatsNewSeen": () =>
          complete(
            callEffect((call) => settings.forCall(call).markWhatsNewSeen).pipe(
              Effect.as(undefined),
              Effect.mapError(writeError)
            )
          ),
        "Settings.WatchChanged": (_payload, options) => streams.settings(options.headers),
        "App.GetVersion": () =>
          complete(callEffect((call) => app.forCall(call).getVersion).pipe(Effect.mapError(nativeError))),
        "App.GetPlatform": () =>
          complete(callEffect((call) => app.forCall(call).getPlatform).pipe(Effect.mapError(nativeError))),
        "App.GetOsVersion": () =>
          complete(callEffect((call) => app.forCall(call).getOsVersion).pipe(Effect.mapError(nativeError))),
        "App.Quit": () =>
          complete(
            callEffect((call) => app.forCall(call).quit.pipe(Effect.as(undefined))).pipe(Effect.mapError(nativeError))
          ),
        "App.GetDownloaderStatus": (_payload, options) =>
          native(options.headers, (call) => app.forCall(call).getDownloaderStatus.pipe(Effect.mapError(nativeError))),
        "App.GetYtDlpKernelStatus": Effect.fn("App.GetYtDlpKernelStatus")(function* ({ kernel }, options) {
          const bound = yield* dependent(options.headers, kernel, "kernel");
          return yield* complete(
            callEffect((call) => app.forCall(call).getYtDlpKernelStatus).pipe(Effect.mapError(nativeError)),
            bound
          );
        }),
        "App.RetryYtDlpKernelPreparation": Effect.fn("App.RetryYtDlpKernelPreparation")(function* (
          { kernel },
          options
        ) {
          const bound = yield* dependent(options.headers, kernel, "kernel");
          return yield* native(
            options.headers,
            (call) => app.forCall(call).retryYtDlpKernelPreparation.pipe(Effect.mapError(nativeError)),
            bound
          );
        }),
        "App.ShowMessageBox": ({ options }, request) =>
          native(
            request.headers,
            (call) => app.forCall(call).showMessageBox(options).pipe(Effect.mapError(nativeError)),
            undefined,
            (measureValue(options) ?? 64 * 1024 * 1024) + 4096
          ),
        "App.GetSiteIcon": ({ domain }, options) =>
          native(options.headers, (call, retention) =>
            app.forCall(call).getSiteIcon(domain, retention).pipe(Effect.mapError(nativeError))
          ),
        "App.WatchYtDlpKernelStatus": (_payload, options) => streams.kernel(options.headers),
        "App.WatchShowHome": (_payload, options) => streams.home(options.headers),
        "Window.Minimize": () =>
          complete(
            callEffect((call) => window.forCall(call).minimize.pipe(Effect.as(undefined))).pipe(
              Effect.mapError(nativeError)
            )
          ),
        "Window.Maximize": () =>
          complete(
            callEffect((call) => window.forCall(call).maximize.pipe(Effect.as(undefined))).pipe(
              Effect.mapError(nativeError)
            )
          ),
        "Window.Close": () =>
          complete(
            callEffect((call) => window.forCall(call).close.pipe(Effect.as(undefined))).pipe(
              Effect.mapError(nativeError)
            )
          ),
        "Window.IsMaximized": () =>
          complete(callEffect((call) => window.forCall(call).isMaximized).pipe(Effect.mapError(nativeError))),
        "Window.CaptureShareCard": ({ payload }, options) =>
          native(options.headers, (call, retention) =>
            window.forCall(call).captureShareCard(payload, retention).pipe(Effect.mapError(nativeError))
          ),
        "Window.WriteShareImage": ({ data }) =>
          complete(
            callEffect((call) => window.forCall(call).writeShareImage(data).pipe(Effect.as(undefined))).pipe(
              Effect.mapError(nativeError)
            )
          ),
      });
    })
  );
