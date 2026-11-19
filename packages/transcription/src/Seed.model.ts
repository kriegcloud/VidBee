import * as S from "effect/Schema";
import { TranscriptSourceKind } from "./Literal.model.js";
import { PipelineSegment, PipelineSpeaker } from "./Pipeline.model.js";
import { TranscriptWord } from "./Transcript.model.js";
export const PipelineSeed = S.Struct({
  language: S.String.pipe(S.NullOr, S.mutableKey),
  modelVersion: S.mutableKey(S.String),
  asrTier: S.String.pipe(S.NullOr, S.mutableKey),
  sourceKind: TranscriptSourceKind.pipe(S.optional, S.mutableKey),
  speakers: PipelineSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
  segments: PipelineSegment.pipe(S.Array, S.mutable, S.mutableKey),
});
export type PipelineSeed = typeof PipelineSeed.Type;
export const LabeledToken = S.Struct({
  ...TranscriptWord.fields,
  confidence: S.Finite.pipe(S.NullOr, S.mutableKey),
  speakerKey: S.String.pipe(S.NullOr, S.mutableKey),
  timed: S.mutableKey(S.Boolean),
});
export type LabeledToken = typeof LabeledToken.Type;

// Seed roots are projected deliberately; retained nested metadata remains open.
export const PersistedSeedWord = S.StructWithRest(TranscriptWord, [S.Record(S.String, S.Unknown)]);
export const PersistedSeedSegment = S.StructWithRest(
  S.Struct({ ...PipelineSegment.fields, words: PersistedSeedWord.pipe(S.Array, S.mutable, S.optional, S.mutableKey) }),
  [S.Record(S.String, S.Unknown)]
);
export const PersistedSeedSpeaker = S.StructWithRest(PipelineSpeaker, [S.Record(S.String, S.Unknown)]);
export const PersistedPipelineSeed = S.Struct({
  ...PipelineSeed.fields,
  speakers: PersistedSeedSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
  segments: PersistedSeedSegment.pipe(S.Array, S.mutable, S.mutableKey),
});
