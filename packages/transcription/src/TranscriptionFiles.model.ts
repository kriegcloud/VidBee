import * as S from "effect/Schema";
export const TranscriptionFileStat = S.Struct({
  size: S.Finite,
  mtimeMs: S.Finite,
  isFile: S.Boolean,
  isDirectory: S.Boolean,
});
export type TranscriptionFileStat = typeof TranscriptionFileStat.Type;
