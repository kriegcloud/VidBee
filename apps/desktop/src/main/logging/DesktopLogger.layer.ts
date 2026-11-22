import * as Layer from "effect/Layer";
import { DesktopLoggerLive } from "../../shared/logging/DesktopLogger.layer.js";
import { ElectronLogLive } from "./ElectronLog.driver.js";

/** Main logger composition, shared by the main runtime and its compatibility runner.
 * **Example** (Use the replacing sink)
 * ```ts
 * const Logging = DesktopMainLoggerLive
 * ```
 * @category layers
 * @since 0.0.0
 */
export const DesktopMainLoggerLive = DesktopLoggerLive.pipe(Layer.provide(ElectronLogLive));
