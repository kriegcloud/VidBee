import * as ManagedRuntime from "effect/ManagedRuntime";
import { forwardingLogger } from "../../../shared/logging/ForwardLogger.layer.js";
import type { DesktopLogWire } from "../../../shared/logging/DesktopLogWire.model.js";

/** Renderer compatibility runner. The Atom runtime uses the same forwarding Layer.
 * **Example** (Create with the document sender)
 * ```ts
 * import { createRendererLogger } from "./RendererLogger.entry.js"
 * import type { DesktopLogWire } from "../../../shared/logging/DesktopLogWire.model.js"
 * import * as Effect from "effect/Effect"
 * const entries: Array<DesktopLogWire> = []
 * const runtime = createRendererLogger(entry => { entries.push(entry) })
 * await runtime.runPromise(Effect.logInfo("ready"))
 * console.assert(entries.length === 1)
 * await runtime.dispose()
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createRendererLogger = (send: (entry: DesktopLogWire) => void) =>
  ManagedRuntime.make(forwardingLogger(send));
