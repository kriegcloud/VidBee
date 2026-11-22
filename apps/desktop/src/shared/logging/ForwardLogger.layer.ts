import * as Layer from "effect/Layer";
import { DesktopLogSink } from "./DesktopLog.service.js";
import { DesktopLoggerLive } from "./DesktopLogger.layer.js";
import { encodeDesktopLog } from "./DesktopLogWire.driver.js";
import type { DesktopLogWire } from "./DesktopLogWire.model.js";

/** Forward an entry once. A closed document drops it without recursive error logging.
 * **Example** (Supply an IPC sender)
 * ```ts
 * import { forwardingLogger } from "./ForwardLogger.layer.js"
 * import type { DesktopLogWire } from "./DesktopLogWire.model.js"
 * const entries: Array<DesktopLogWire> = []
 * const live = forwardingLogger((entry) => { entries.push(entry) })
 * void live
 * ```
 * @category layers
 * @since 0.0.0
 */
export const forwardingLogger = (send: (entry: DesktopLogWire) => void) =>
  DesktopLoggerLive.pipe(
    Layer.provide(
      Layer.succeed(DesktopLogSink, {
        emit: (entry) => {
          try {
            send(encodeDesktopLog(entry));
          } catch {
            /* A disconnected bridge cannot report through itself. */
          }
        },
      })
    )
  );
