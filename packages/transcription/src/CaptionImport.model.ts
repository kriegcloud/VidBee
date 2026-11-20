import * as S from "effect/Schema";
import { CaptionTrack } from "./Caption.model.js";
export const CaptionImportInput = S.Struct({
  downloadTaskId: S.String,
  sourceFilePath: S.String,
  preferredLanguages: S.String.pipe(S.Array, S.optional),
});
export type CaptionImportInput = typeof CaptionImportInput.Type;
export const CaptionCommitInput = S.Struct({
  ...CaptionImportInput.fields,
  track: CaptionTrack,
  replace: S.optional(S.Boolean),
  convertScript: S.optional(S.Boolean),
});
export type CaptionCommitInput = typeof CaptionCommitInput.Type;
export const CaptionSwitchInput = S.Struct({ ...CaptionImportInput.fields, language: S.String });
export type CaptionSwitchInput = typeof CaptionSwitchInput.Type;
