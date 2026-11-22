import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import log from "electron-log/main";
import { DesktopLogEntry } from "../../shared/logging/DesktopLog.model.js";
import { DesktopLogSink } from "../../shared/logging/DesktopLog.service.js";
import { decodeDesktopLog } from "../../shared/logging/DesktopLogWire.driver.js";

/** Exact electron-log singleton retained by legacy capabilities.
 * **Example** (Retain native initialization)
 * ```ts
 * import { electronLog } from "./ElectronLog.driver.js"
 * const initialize = () => electronLog.initialize()
 * void initialize
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const electronLog = log;

/** Decode one bridge entry and deliver directly to the native sink; malformed entries are dropped.
 * **Example** (Forward without recursion)
 * ```ts
 * import { receiveDesktopLog } from "./ElectronLog.driver.js"
 * const receive = () => receiveDesktopLog({ level: "warn", scope: "window", args: ["closed"] })
 * void receive
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const receiveDesktopLog = (input: unknown): void => {
  const decoded = O.flatMap(decodeDesktopLog(input), S.decodeUnknownOption(DesktopLogEntry));
  if (O.isSome(decoded)) {
    const entry = decoded.value;
    const target = entry.scope === "" ? log : log.scope(entry.scope);
    target[entry.level](...entry.args, ...(entry.context === undefined ? [] : [{ effect: entry.context }]));
  }
};

/** Main-process sink reuses the installed electron-log transports and rotation.
 * **Example** (Provide the main sink)
 * ```ts
 * import { ElectronLogLive } from "./ElectronLog.driver.js"
 * import { DesktopLoggerLive } from "../../shared/logging/DesktopLogger.layer.js"
 * import * as Layer from "effect/Layer"
 * const live = DesktopLoggerLive.pipe(Layer.provide(ElectronLogLive))
 * void live
 * ```
 * @category layers
 * @since 0.0.0
 */
export const ElectronLogLive = Layer.succeed(DesktopLogSink, { emit: receiveDesktopLog });
