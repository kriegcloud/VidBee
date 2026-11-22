import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/logging/DesktopLog.model");

/** Original transport levels, including electron-log's two extra diagnostic levels.
 * **Example** (Decode verbose)
 * ```ts
 * import { DesktopLogLevel } from "./DesktopLog.model.js"
 * import * as S from "effect/Schema"
 * S.is(DesktopLogLevel)("verbose")
 * ```
 * @category models
 * @since 0.0.0
 */
export const DesktopLogLevel = LiteralKit(["error", "warn", "info", "verbose", "debug", "silly"]).pipe(
  $I.annoteSchema("DesktopLogLevel", {
    description: "Original electron-log transport severity, including verbose and silly.",
  })
);
/** The six validated native severity values.
 * **Example** (Use a severity)
 * ```ts
 * import type { DesktopLogLevel } from "./DesktopLog.model.js"
 * const level: DesktopLogLevel = "info"
 * void level
 * ```
 * @category models
 * @since 0.0.0
 */
export type DesktopLogLevel = typeof DesktopLogLevel.Type;

/** Effect-only diagnostic context, kept separate from the original argument vector.
 * **Example** (Capture an empty context)
 * ```ts
 * import { DesktopLogContext } from "./DesktopLog.model.js"
 * DesktopLogContext.make({ reasons: [], annotations: {}, spans: [] })
 * ```
 * @category models
 * @since 0.0.0
 */
export class DesktopLogContext extends S.Opaque<DesktopLogContext, { readonly brand: unique symbol }>()(
  S.Struct({
    reasons: S.Array(S.Unknown),
    annotations: S.Record(S.String, S.Unknown),
    spans: S.Array(S.Tuple([S.String, S.Finite])),
  }).pipe(
    $I.annoteSchema("DesktopLogContext", {
      description: "Complete flat Cause reasons, captured stack chains, log annotations and log spans.",
    })
  )
) {}

/** Structured-clone logging envelope. Arguments deliberately remain unknown and ordered.
 * **Example** (Construct an entry)
 * ```ts
 * import { DesktopLogEntry } from "./DesktopLog.model.js"
 * DesktopLogEntry.make({ level: "info", scope: "main", args: ["ready", { count: 2 }] })
 * ```
 * @category models
 * @since 0.0.0
 */
export class DesktopLogEntry extends S.Opaque<DesktopLogEntry, { readonly brand: unique symbol }>()(
  S.Struct({
    level: DesktopLogLevel,
    scope: S.String,
    args: S.Array(S.Unknown),
    context: S.optional(DesktopLogContext),
  }).pipe(
    $I.annoteSchema("DesktopLogEntry", {
      description: "A process logging entry with ordered opaque arguments and original scope.",
    })
  )
) {}

/** Dedicated one-way bridge; it never routes through the application logger.
 * **Example** (Identify the channel)
 * ```ts
 * import { DesktopLogChannel } from "./DesktopLog.model.js"
 * DesktopLogChannel === "vidbee:log"
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const DesktopLogChannel = "vidbee:log";
