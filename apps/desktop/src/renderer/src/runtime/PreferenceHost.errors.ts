import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("renderer/src/runtime/PreferenceHost.errors");
/** Retains an in-document language primitive failure for the existing renderer logger; this carrier never enters an RPC DTO.
 * **Example** (Keep the original language failure)
 * ```ts
 * import { PreferenceHostError } from './PreferenceHost.errors.js'
 * const original=new Error('language unavailable')
 * PreferenceHostError.make({original}).original===original // => true
 * ```
 * @category errors
 * @since 0.0.0
 */
export class PreferenceHostError extends S.TaggedError<PreferenceHostError, { readonly brand: unique symbol }>()(
  "PreferenceHostError",
  { original: S.Unknown },
  $I.annoteError("PreferenceHostError", { description: "Original renderer language failure." })
) {}
