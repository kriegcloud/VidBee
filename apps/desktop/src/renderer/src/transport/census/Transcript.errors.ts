import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";

const $I = $DesktopId.create("shared/Transcript.errors");
export class TranscriptOperationError extends S.TaggedError<
  TranscriptOperationError,
  { readonly brand: unique symbol }
>()(
  "TranscriptOperationError",
  { operation: S.String, legacyName: S.String, message: S.String, code: RpcOptional(S.String) },
  $I.annote("TranscriptOperationError", {
    description: "Serialized application failure; original object remains main-only.",
  })
) {}
