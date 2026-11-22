import * as ManagedRuntime from "effect/ManagedRuntime";
import { forwardingLogger } from "../../shared/logging/ForwardLogger.layer.js";
import type { DesktopLogWire } from "../../shared/logging/DesktopLogWire.model.js";

/** Preload's single forwarding runtime preserves Debug/Trace with minimum All.
 * **Example** (Create with the preload sender)
 * ```ts
 * import { createPreloadLogger } from "./PreloadLogger.entry.js"
 * import type { DesktopLogWire } from "../../shared/logging/DesktopLogWire.model.js"
 * import * as Effect from "effect/Effect"
 * const entries: Array<DesktopLogWire> = []
 * const runtime = createPreloadLogger(entry => { entries.push(entry) })
 * await runtime.runPromise(Effect.logInfo("ready"))
 * console.assert(entries.length === 1)
 * await runtime.dispose()
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createPreloadLogger = (send: (entry: DesktopLogWire) => void) =>
  ManagedRuntime.make(forwardingLogger(send));
