import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";

const $I = $DesktopId.create("shared/Transcript.errors");

/**
 * Validates Transcript Operation Error at the desktop capability boundary before dispatch.
 *
 * **Example** (Use TranscriptOperationError at its owning boundary)
 *
 * ```ts
 * import { TranscriptOperationError } from "./Transcript.errors.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(TranscriptOperationError);
 * const validated = decode({});
 * void validated;
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
