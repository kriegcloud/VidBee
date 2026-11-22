import { $DesktopId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import type { DesktopLogEntry } from "./DesktopLog.model.js";

const $I = $DesktopId.create("shared/logging/DesktopLog.service");

/** Synchronous per-process sink. Forwarding failures are terminal for this entry only.
 * **Example** (Inject a sink)
 * ```ts
 * import { DesktopLogSink } from "./DesktopLog.service.js"
 * DesktopLogSink.of({ emit: () => {} })
 * ```
 * @category services
 * @since 0.0.0
 */
export class DesktopLogSink extends Context.Service<
  DesktopLogSink,
  {
    readonly emit: (entry: DesktopLogEntry) => void;
  }
>()($I`DesktopLogSink`) {}
