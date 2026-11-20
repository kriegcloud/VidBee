import * as S from "effect/Schema";
import { TranscriptionStage, TranscriptResultKind, TranscriptSourceKind } from "./Literal.model.js";
import { TranscriptWord } from "./Transcript.model.js";
import { FloatSamples } from "./WaveSamples.model.js";
export const PipelineSpeaker = S.Struct({
  speakerKey: S.mutableKey(S.String),
  displayName: S.mutableKey(S.String),
});
export type PipelineSpeaker = typeof PipelineSpeaker.Type;
export const PipelineSegment = S.Struct({
  speakerKey: S.mutableKey(S.Union([S.String, S.Null])),
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
  words: TranscriptWord.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  confidence: S.mutableKey(S.Union([S.Finite, S.Null])),
});
export type PipelineSegment = typeof PipelineSegment.Type;
export const PipelineResult = S.Struct({
  resultKind: S.mutableKey(TranscriptResultKind),
  language: S.mutableKey(S.Union([S.String, S.Null])),
  modelVersion: S.mutableKey(S.String),
  asrTier: S.mutableKey(S.Union([S.String, S.Null])),
  sourceKind: TranscriptSourceKind.pipe(S.optional, S.mutableKey),
  speakers: PipelineSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
  segments: PipelineSegment.pipe(S.Array, S.mutable, S.mutableKey),
});
export type PipelineResult = typeof PipelineResult.Type;
export const PipelineProgress = S.Struct({
  stage: S.mutableKey(TranscriptionStage),
  percent: S.mutableKey(S.Union([S.Finite, S.Null])),
  message: S.String.pipe(S.optional, S.mutableKey),
});
export type PipelineProgress = typeof PipelineProgress.Type;
export const AsrWord = S.Struct({
  endMs: S.mutableKey(S.Finite),
  startMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
});
export type AsrWord = typeof AsrWord.Type;
export const AsrRecognizerResult = S.Struct({
  durations: S.Finite.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  text: S.String.pipe(S.optional, S.mutableKey),
  timestamps: S.Finite.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  tokens: S.String.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
});
export type AsrRecognizerResult = typeof AsrRecognizerResult.Type;
export const TimedTurn = S.Struct({
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  speakerKey: S.mutableKey(S.String),
});
export type TimedTurn = typeof TimedTurn.Type;
export const TimeInterval = S.Struct({
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
});
export type TimeInterval = typeof TimeInterval.Type;
export const RefineSpeakerOptions = S.Struct({
  knownCount: S.Boolean.pipe(S.optional, S.mutableKey),
});
export type RefineSpeakerOptions = typeof RefineSpeakerOptions.Type;
export const DiarizeWindow = S.Struct({
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
});
export type DiarizeWindow = typeof DiarizeWindow.Type;
export const SpeakerEmbed = S.Struct({
  speakerKey: S.mutableKey(S.String),
  vector: S.mutableKey(FloatSamples),
});
export type SpeakerEmbed = typeof SpeakerEmbed.Type;
export const SpeakerEmbedItem = S.Struct({
  id: S.mutableKey(S.String),
  vector: S.mutableKey(FloatSamples),
});
export type SpeakerEmbedItem = typeof SpeakerEmbedItem.Type;
export const ExtractedAudio = S.Struct({
  wavPath: S.mutableKey(S.String),
  durationMs: S.mutableKey(S.Finite),
});
export type ExtractedAudio = typeof ExtractedAudio.Type;
export const PcmWave = S.Struct({
  sampleRate: S.mutableKey(S.Finite),
  samples: S.mutableKey(FloatSamples),
});
export type PcmWave = typeof PcmWave.Type;

/** Worker files retain metadata at every result level that may be persisted again. */
export const PersistedResultWord = S.StructWithRest(TranscriptWord, [S.Record(S.String, S.Unknown)]);
export const PersistedResultSpeaker = S.StructWithRest(PipelineSpeaker, [S.Record(S.String, S.Unknown)]);
export const PersistedResultSegment = S.StructWithRest(
  S.Struct({
    ...PipelineSegment.fields,
    words: PersistedResultWord.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
  }),
  [S.Record(S.String, S.Unknown)]
);
export const PersistedPipelineResult = S.StructWithRest(
  S.Struct({
    ...PipelineResult.fields,
    speakers: PersistedResultSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
    segments: PersistedResultSegment.pipe(S.Array, S.mutable, S.mutableKey),
  }),
  [S.Record(S.String, S.Unknown)]
);
