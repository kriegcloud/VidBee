import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";

const $I = $DesktopId.create("shared/Transcript.errors");

/**
 * Carries a transcription operation failure separately from document transport or delivery failure.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { TranscriptOperationError } from "./Transcript.errors.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(TranscriptOperationError)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class TranscriptOperationError extends S.TaggedError<
  TranscriptOperationError,
  { readonly brand: unique symbol }
>()(
  "TranscriptOperationError",
  { operation: S.String, legacyName: S.String, message: S.String, code: RpcOptional(S.String) },
  $I.annoteError("TranscriptOperationError", {
    description: "Serialized application failure; original object remains main-only.",
  })
) {}
