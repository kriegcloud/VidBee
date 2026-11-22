import * as Layer from "effect/Layer";
import { DesktopLogSink } from "./DesktopLog.service.js";
import { DesktopLoggerLive } from "./DesktopLogger.layer.js";
import type { DesktopLogEntry } from "./DesktopLog.model.js";

/** Forward an entry once. A closed document drops it without recursive error logging.
 * **Example** (Supply an IPC sender)
 * ```ts
 * const Live = forwardingLogger((entry) => send(entry))
 * ```
 * @category layers
 * @since 0.0.0
 */
export const forwardingLogger = (send: (entry: DesktopLogEntry) => void) =>
  DesktopLoggerLive.pipe(
    Layer.provide(
      Layer.succeed(DesktopLogSink, {
        emit: (entry) => {
          try {
            send(entry);
          } catch {
            /* A disconnected bridge cannot report through itself. */
          }
        },
      })
    )
  );
