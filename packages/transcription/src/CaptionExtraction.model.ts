import * as S from "effect/Schema";
export const ExtractedCaptionTrack = S.Struct({
  language: S.String.pipe(S.NullOr, S.mutableKey),
  text: S.mutableKey(S.String),
  title: S.String.pipe(S.optional, S.mutableKey),
});
export type ExtractedCaptionTrack = typeof ExtractedCaptionTrack.Type;
export const CaptionExtractionInput = S.Struct({
  ffmpegPath: S.String,
  filePath: S.String,
  preferredLanguages: S.String.pipe(S.Array, S.mutable, S.optional),
});
export type CaptionExtractionInput = typeof CaptionExtractionInput.Type;
export const CaptionProbeStream = S.Struct({
  codec_name: S.optional(S.String),
  codec_type: S.optional(S.String),
  index: S.optional(S.Finite),
  tags: S.optional(S.Struct({ language: S.optional(S.String), title: S.optional(S.String) })),
});
export type CaptionProbeStream = typeof CaptionProbeStream.Type;
export const CaptionProbeEnvelope = S.Struct({ streams: CaptionProbeStream.pipe(S.Array, S.NullOr, S.optional) });
