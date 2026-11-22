import * as ManagedRuntime from "effect/ManagedRuntime";
import { forwardingLogger } from "../../shared/logging/ForwardLogger.layer.js";
import type { DesktopLogEntry } from "../../shared/logging/DesktopLog.model.js";

/** Preload's single forwarding runtime preserves Debug/Trace with minimum All.
 * **Example** (Create with the preload sender)
 * ```ts
 * const runtime = createPreloadLogger((entry) => ipcRenderer.send("vidbee:log", entry))
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createPreloadLogger = (send: (entry: DesktopLogEntry) => void) =>
  ManagedRuntime.make(forwardingLogger(send));
