import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/DesktopOperation.errors");
/** Public native desktop failure; private original errors stay in the main compatibility boundary.
 *
 * **Example** (Describe an unavailable native operation)
 *
 * ```ts
 * import { DesktopOperationError } from './DesktopOperation.errors.js'
 * DesktopOperationError.make({operation:'App.GetVersion',message:'unavailable'}).operation // => 'App.GetVersion'
 * ```
 *
 * @category errors
 * @since 0.0.0
 */
export class DesktopOperationError extends S.TaggedError<DesktopOperationError, { readonly brand: unique symbol }>()(
  "DesktopOperationError",
  { operation: S.String, message: S.String },
  $I.annoteError("DesktopOperationError", { description: "A native desktop operation failed." })
) {}
