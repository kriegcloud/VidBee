import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { DesktopMainLoggerLive } from "./DesktopLogger.layer.js";
import { otlpLayer } from "./Otlp.layer.js";
import type { OtlpConfiguration } from "./Otlp.model.js";

/** Create the main logging runtime at the existing configuration point.
 * **Example** (Create an explicitly enabled runtime)
 * ```ts
 * const runtime = createDesktopLogging(configuration)
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createDesktopLogging = (configuration: OtlpConfiguration) => {
  const runtime = ManagedRuntime.make(Layer.mergeAll(DesktopMainLoggerLive, otlpLayer(configuration)));
  runtime.runFork(Effect.void);
  return runtime;
};
