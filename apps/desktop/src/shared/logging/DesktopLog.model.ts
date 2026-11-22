import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/logging/DesktopLog.model");

/** Original transport levels, including electron-log's two extra diagnostic levels.
 * **Example** (Decode verbose)
 * ```ts
 * import * as S from "effect/Schema"
 * S.is(DesktopLogLevel)("verbose") // true
 * ```
 * @category models
 * @since 0.0.0
 */
export const DesktopLogLevel = LiteralKit(["error", "warn", "info", "verbose", "debug", "silly"]).pipe(
  $I.annoteSchema("DesktopLogLevel", {
    description: "Original electron-log transport severity, including verbose and silly.",
  })
);
export type DesktopLogLevel = typeof DesktopLogLevel.Type;

/** Structured-clone logging envelope. Arguments deliberately remain unknown and ordered.
 * **Example** (Construct an entry)
 * ```ts
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
  }).pipe(
    $I.annoteSchema("DesktopLogEntry", {
      description: "A process logging entry with ordered opaque arguments and original scope.",
    })
  )
) {}

/** Dedicated one-way bridge; it never routes through the application logger.
 * **Example** (Identify the channel)
 * ```ts
 * DesktopLogChannel === "vidbee:log"
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const DesktopLogChannel = "vidbee:log";
