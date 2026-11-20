import * as S from "effect/Schema";
export const ImportCaptionsRequest = S.Struct({
  downloadTaskId: S.String,
  sourceFilePath: S.String,
  title: S.optional(S.String),
});
export type ImportCaptionsRequest = typeof ImportCaptionsRequest.Type;
