import * as ManagedRuntime from "effect/ManagedRuntime";
import { forwardingLogger } from "../../../shared/logging/ForwardLogger.layer.js";
import type { DesktopLogEntry } from "../../../shared/logging/DesktopLog.model.js";

/** Renderer compatibility runner. The Atom runtime uses the same forwarding Layer.
 * **Example** (Create with the document sender)
 * ```ts
 * const runtime = createRendererLogger((entry) => ipc.send("vidbee:log", entry))
 * ```
 * @category runtime
 * @since 0.0.0
 */
export const createRendererLogger = (send: (entry: DesktopLogEntry) => void) =>
  ManagedRuntime.make(forwardingLogger(send));
