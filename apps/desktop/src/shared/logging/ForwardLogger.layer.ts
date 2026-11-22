import * as Layer from "effect/Layer";
import { DesktopLogSink } from "./DesktopLog.service.js";
import { DesktopLoggerLive } from "./DesktopLogger.layer.js";
import { encodeDesktopLog } from "./DesktopLogWire.driver.js";
import type { DesktopLogWire } from "./DesktopLogWire.model.js";

/** Forward an entry once. A closed document drops it without recursive error logging.
 * **Example** (Supply an IPC sender)
 * ```ts
 * import { forwardingLogger } from "./ForwardLogger.layer.js"
 * import { createRendererLogger } from "../../renderer/src/logging/RendererLogger.entry.js"
 * import type { DesktopLogWire } from "./DesktopLogWire.model.js"
 * import * as Effect from "effect/Effect"
 * import * as Layer from "effect/Layer"
 * const entries: Array<DesktopLogWire> = []
 * const runtime = createRendererLogger(() => {})
 * const live = forwardingLogger(entry => { entries.push(entry) })
 * // Isolate this sample from the owner's existing logger memoization.
 * await runtime.runPromise(live.pipe(Layer.fresh, Layer.build, Effect.flatMap(context => Effect.provideContext(Effect.logInfo("ready"), context)), Effect.scoped))
 * console.assert(entries.length === 1 && entries[0]?.format === "vidbee-log-graph/1")
 * await runtime.dispose()
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
