import { $StandardsId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $StandardsId.create("Standards.errors");
/**
 * InvalidInput supplies the owned InvalidInput infrastructure capability.
 *
 *
 * **Example** (Retain a deliberate message)
 *
 * ```ts
 * import { InvalidInput } from "@vidbee/standards"
 * import { strictEqual } from "node:assert"
 * const failure = InvalidInput.make({message: "Malformed input."})
 * strictEqual(failure.message, "Malformed input.")
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export class InvalidInput extends S.TaggedError<InvalidInput, { readonly brand: unique symbol }>()(
  "InvalidInput",
  { message: S.String },
  $I.annoteError("InvalidInput", { description: "Invalid argument, scope, tool version, or source input." })
) {}
/**
 * InfrastructureFailure supplies the owned InfrastructureFailure infrastructure capability.
 *
 *
 * **Example** (Retain a deliberate message)
 *
 * ```ts
 * import { InfrastructureFailure } from "@vidbee/standards"
 * import { strictEqual } from "node:assert"
 * const failure = InfrastructureFailure.make({message: "Malformed input.", cause: "fixture"})
 * strictEqual(failure.message, "Malformed input.")
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export class InfrastructureFailure extends S.TaggedError<InfrastructureFailure, { readonly brand: unique symbol }>()(
  "InfrastructureFailure",
  { message: S.String, cause: S.Defect({ includeStack: true }) },
  $I.annoteError("InfrastructureFailure", { description: "Compiler or inventory execution could not complete." })
) {}
