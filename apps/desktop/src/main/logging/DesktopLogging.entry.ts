import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { DesktopMainLoggerLive } from "./DesktopLogger.layer.js";
import { electronLog } from "./ElectronLog.driver.js";
import { otlpLayer } from "./Otlp.layer.js";
import type { OtlpConfiguration } from "./Otlp.model.js";

/** Observed application logging owner; failed telemetry falls back to native logging.
 * **Example** (Observe readiness)
 * ```ts
 * import type { DesktopLogging } from "./DesktopLogging.entry.js"
 * const ready = (logging: DesktopLogging) => logging.ready
 * void ready
 * ```
 * @category runtime
 * @since 0.0.0
 */
export interface DesktopLogging {
  readonly dispose: () => Promise<void>;
  readonly ready: Promise<boolean>;
  readonly runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
}

/** Inject telemetry acquisition while retaining the production failure policy.
 * **Example** (Create a logging-only owner)
 * ```ts
 * import { createDesktopLoggingWith } from "./DesktopLogging.entry.js"
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * import * as Layer from "effect/Layer"
 * const logging = createDesktopLoggingWith(OtlpConfiguration.make({ enabled: false, endpoint: "", version: "" }), Layer.empty)
 * void logging.ready.then(() => logging.dispose())
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createDesktopLoggingWith: {
  <R, E>(configuration: OtlpConfiguration, telemetry: Layer.Layer<R, E>): DesktopLogging;
  <R, E>(telemetry: Layer.Layer<R, E>): (configuration: OtlpConfiguration) => DesktopLogging;
} = dual(2, <R, E>(configuration: OtlpConfiguration, telemetry: Layer.Layer<R, E>): DesktopLogging => {
  let runtime: ManagedRuntime.ManagedRuntime<never, E> = ManagedRuntime.make(
    Layer.mergeAll(DesktopMainLoggerLive, telemetry)
  );
  const ready = runtime
    .context()
    .then(() =>
      configuration.enabled ? runtime.runPromise(Effect.void.pipe(Effect.withSpan("desktop.logging.ready"))) : undefined
    )
    .then(() => true)
    .catch(() => {
      // Neither the failing Cause nor configuration values cross this diagnostic boundary.
      electronLog.warn("Desktop telemetry initialization failed; continuing without telemetry.");
      const failed = runtime;
      runtime = ManagedRuntime.make(DesktopMainLoggerLive);
      void failed.dispose().catch(() => {});
      return runtime.context().then(() => false);
    });
  return {
    ready,
    runPromise: (effect) => ready.then(() => runtime.runPromise(effect)),
    dispose: () => ready.then(() => runtime.dispose()),
  };
});

/** Create an observed logger with explicitly configured optional telemetry.
 * **Example** (Keep tracing off)
 * ```ts
 * import { createDesktopLogging } from "./DesktopLogging.entry.js"
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * const logging = createDesktopLogging(OtlpConfiguration.make({ enabled: false, endpoint: "", version: "" }))
 * void logging.ready.then(() => logging.dispose())
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createDesktopLogging = (configuration: OtlpConfiguration): DesktopLogging =>
  createDesktopLoggingWith(configuration, otlpLayer(configuration));
