import * as Layer from "effect/Layer";
import { DesktopLoggerLive } from "../../shared/logging/DesktopLogger.layer.js";
import { ElectronLogLive } from "./ElectronLog.driver.js";

/** Main logger composition, shared by the main runtime and its compatibility runner.
 * **Example** (Use the replacing sink)
 * ```ts
 * import { DesktopMainLoggerLive } from "./DesktopLogger.layer.js"
 * import { createDesktopLogging } from "./DesktopLogging.entry.js"
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * import * as Effect from "effect/Effect"
 * import * as References from "effect/References"
 * import * as Layer from "effect/Layer"
 * const runtime = createDesktopLogging(OtlpConfiguration.make({ enabled: false, endpoint: "", version: "" }))
 * console.assert(await runtime.runPromise(DesktopMainLoggerLive.pipe(Layer.fresh, Layer.build, Effect.flatMap(context => Effect.provideContext(References.MinimumLogLevel, context)), Effect.scoped)) === "All")
 * await runtime.dispose()
 * ```
 * @category layers
 * @since 0.0.0
 */
export const DesktopMainLoggerLive = DesktopLoggerLive.pipe(Layer.provide(ElectronLogLive));
