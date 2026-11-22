import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import log from "electron-log/main";
import { DesktopLogSink } from "../../shared/logging/DesktopLog.service.js";
import { decodeDesktopLog } from "../../shared/logging/DesktopLogWire.driver.js";
import type { DesktopLogEntry } from "../../shared/logging/DesktopLog.model.js";

/** Exact electron-log singleton retained by legacy capabilities.
 * **Example** (Retain native initialization)
 * ```ts
 * import { electronLog } from "./ElectronLog.driver.js"
 * // In the main entrypoint's existing initialization sequence:
 * electronLog.initialize()
 * electronLog.info("native logger initialized")
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const electronLog = log;

/** Decode one bridge entry and deliver directly to the native sink; malformed entries are dropped.
 * **Example** (Forward without recursion)
 * ```ts
 * import { receiveDesktopLog } from "./ElectronLog.driver.js"
 * // Deliver one visible warning through the configured native transports.
 * receiveDesktopLog({ level: "warn", scope: "window", args: ["closed"] })
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const receiveDesktopLog = (input: unknown): void => {
  try {
    const decoded = decodeDesktopLog(input);
    if (O.isSome(decoded)) emit(decoded.value);
  } catch {
    /* IPC ingress never retries or recursively logs rejected input. */
  }
};

// Trusted local logging retains the original unbudgeted native call semantics.
const emit = (entry: DesktopLogEntry): void => {
  const target = entry.scope === "" ? log : log.scope(entry.scope);
  target[entry.level](...entry.args, ...(entry.context === undefined ? [] : [{ effect: entry.context }]));
};

/** Main-process sink reuses the installed electron-log transports and rotation.
 * **Example** (Provide the main sink)
 * ```ts
 * import { ElectronLogLive } from "./ElectronLog.driver.js"
 * import { DesktopLoggerLive } from "../../shared/logging/DesktopLogger.layer.js"
 * import { createDesktopLogging } from "./DesktopLogging.entry.js"
 * import { OtlpConfiguration } from "./Otlp.model.js"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * const runtime = createDesktopLogging(OtlpConfiguration.make({ enabled: false, endpoint: "", version: "" }))
 * await runtime.runPromise(DesktopLoggerLive.pipe(Layer.provide(ElectronLogLive), Layer.fresh, Layer.build, Effect.flatMap(context => Effect.provideContext(Effect.logInfo("native sink ready"), context)), Effect.scoped))
 * await runtime.dispose()
 * ```
 * @category layers
 * @since 0.0.0
 */
export const ElectronLogLive = Layer.succeed(DesktopLogSink, { emit });
