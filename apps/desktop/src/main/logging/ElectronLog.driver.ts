import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import log from "electron-log/main";
import { DesktopLogEntry } from "../../shared/logging/DesktopLog.model.js";
import { DesktopLogSink } from "../../shared/logging/DesktopLog.service.js";

/** Exact electron-log singleton retained by legacy capabilities.
 * **Example** (Retain native initialization)
 * ```ts
 * electronLog.initialize()
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const electronLog = log;

/** Decode one bridge entry and deliver directly to the native sink; malformed entries are dropped.
 * **Example** (Forward without recursion)
 * ```ts
 * receiveDesktopLog({ level: "warn", scope: "window", args: ["closed"] })
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const receiveDesktopLog = (input: unknown): void => {
  const decoded = S.decodeUnknownOption(DesktopLogEntry)(input);
  if (O.isSome(decoded)) {
    const entry = decoded.value;
    const target = entry.scope === "" ? log : log.scope(entry.scope);
    target[entry.level](...entry.args);
  }
};

/** Main-process sink reuses the installed electron-log transports and rotation.
 * **Example** (Provide the main sink)
 * ```ts
 * const Live = DesktopLoggerLive.pipe(Layer.provide(ElectronLogLive))
 * ```
 * @category layers
 * @since 0.0.0
 */
export const ElectronLogLive = Layer.succeed(DesktopLogSink, { emit: receiveDesktopLog });
