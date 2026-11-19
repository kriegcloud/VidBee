import * as S from "effect/Schema";
export const RecorderInput = S.Struct({
  display: S.String.pipe(S.mutableKey),
  width: S.Finite.pipe(S.mutableKey),
  height: S.Finite.pipe(S.mutableKey),
  outputPath: S.String.pipe(S.mutableKey),
  pulseSink: S.String.pipe(S.optional, S.mutableKey),
  includeAudio: S.Boolean.pipe(S.mutableKey),
  fps: S.Finite.pipe(S.optional, S.mutableKey),
  originX: S.Finite.pipe(S.optional, S.mutableKey),
  originY: S.Finite.pipe(S.optional, S.mutableKey),
});
export type RecorderInput = typeof RecorderInput.Type;
export const RecorderStart = S.Struct({
  ...RecorderInput.fields,
  ffmpegPath: S.String.pipe(S.mutableKey),
  env: S.Record(S.String, S.UndefinedOr(S.String).pipe(S.mutableKey)).pipe(S.optional, S.mutableKey),
});
export type RecorderStart = typeof RecorderStart.Type;
export const ScanInput = S.Struct({
  ffmpegPath: S.String.pipe(S.mutableKey),
  display: S.String.pipe(S.mutableKey),
  scanWidth: S.Finite.pipe(S.mutableKey),
  scanHeight: S.Finite.pipe(S.mutableKey),
});
export type ScanInput = typeof ScanInput.Type;
