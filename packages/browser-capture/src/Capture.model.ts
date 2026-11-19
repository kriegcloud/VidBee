import * as S from "effect/Schema";

export const CaptureJob = S.Struct({
  url: S.String.pipe(S.mutableKey),
  outputPath: S.String.pipe(S.mutableKey),
  ffmpegPath: S.String.pipe(S.mutableKey),
  cookiesPath: S.String.pipe(S.optional, S.mutableKey),
  browserExecutable: S.String.pipe(S.optional, S.mutableKey),
  width: S.Finite.pipe(S.mutableKey),
  height: S.Finite.pipe(S.mutableKey),
  durationHintSec: S.Finite.pipe(S.optional, S.mutableKey),
  localStorage: S.Record(S.String, S.String.pipe(S.mutableKey)).pipe(S.optional, S.mutableKey),
  userDataDir: S.String.pipe(S.optional, S.mutableKey),
  videoOrdinal: S.Finite.pipe(S.optional, S.mutableKey),
});
export type CaptureJob = typeof CaptureJob.Type;
export const CaptureResult = S.Struct({ filePath: S.String, durationMs: S.NullOr(S.Finite) });
export type CaptureResult = typeof CaptureResult.Type;
