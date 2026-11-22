import { $StandardsId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

const $I = $StandardsId.create("Cli.model");
/**
 * Command validates the command boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before command enters an owning operation.
 *
 * **Example** (Reject invalid Command input)
 *
 * ```ts
 * import { Command } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(Command)("unknown"), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Command = LiteralKit(["check", "docs", "baseline"]).pipe(
  $I.annoteSchema("Command", { description: "Read-only check commands and protected baseline command." })
);
/**
 * Schema-derived decoded Command value.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Command = typeof Command.Type;
/**
 * CliOptions validates the cli options boundary and its required invariants.
 *
 * **When to use**
 * Use to reject malformed input before cliOptions enters an owning operation.
 *
 * **Example** (Reject invalid CliOptions input)
 *
 * ```ts
 * import { CliOptions } from "@vidbee/standards"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * strictEqual(S.is(CliOptions)({}), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class CliOptions extends S.Opaque<CliOptions, { readonly brand: unique symbol }>()(
  S.Struct({
    command: Command,
    packages: S.Array(S.NonEmptyString),
    filesFrom: S.OptionFromNullOr(S.NonEmptyString),
    sourceRoot: S.OptionFromNullOr(S.NonEmptyString),
    trustedRoot: S.OptionFromNullOr(S.NonEmptyString),
    verifyFrom: S.OptionFromNullOr(S.NonEmptyString),
    phase: S.OptionFromNullOr(S.Literal(10)),
    requireClean: S.Boolean,
    json: S.Boolean,
  }).pipe($I.annoteSchema("CliOptions", { description: "Validated CLI selection and protected input locations." }))
) {}
