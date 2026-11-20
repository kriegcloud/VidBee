import * as S from "effect/Schema";
import {
  SpeakerCount,
  TranscriptionProvider,
  TranscriptionStage,
  TranscriptionTrigger,
  TranscriptResultKind,
  TranscriptSourceKind,
} from "./Literal.model.js";
export const TranscriptSourceOption = S.Struct({
  auto: S.mutableKey(S.Boolean),
  key: S.mutableKey(S.String),
  kind: S.mutableKey(TranscriptSourceKind),
  language: S.mutableKey(S.Union([S.String, S.Null])),
  languageCode: S.mutableKey(S.Union([S.String, S.Null])),
  selected: S.mutableKey(S.Boolean),
});
export type TranscriptSourceOption = typeof TranscriptSourceOption.Type;
export const TranscriptStageTiming = S.Struct({
  stage: S.mutableKey(S.String),
  startedAt: S.mutableKey(S.Finite),
});
export type TranscriptStageTiming = typeof TranscriptStageTiming.Type;
export const TranscriptSpeaker = S.Struct({
  id: S.mutableKey(S.String),
  speakerKey: S.mutableKey(S.String),
  displayName: S.mutableKey(S.String),
  sortIndex: S.mutableKey(S.Finite),
});
export type TranscriptSpeaker = typeof TranscriptSpeaker.Type;
export const TranscriptWord = S.Struct({
  endMs: S.mutableKey(S.Finite),
  startMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
});
export type TranscriptWord = typeof TranscriptWord.Type;
export const TranscriptSegment = S.Struct({
  id: S.mutableKey(S.String),
  speakerId: S.mutableKey(S.Union([S.String, S.Null])),
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
  words: TranscriptWord.pipe(S.Array, S.mutable, S.mutableKey),
  confidence: S.mutableKey(S.Union([S.Finite, S.Null])),
  sortIndex: S.mutableKey(S.Finite),
});
export type TranscriptSegment = typeof TranscriptSegment.Type;
export const TranscriptRecord = S.Struct({
  id: S.mutableKey(S.String),
  downloadTaskId: S.mutableKey(S.String),
  transcriptionTaskId: S.mutableKey(S.String),
  resultKind: S.mutableKey(TranscriptResultKind),
  modelVersion: S.mutableKey(S.String),
  asrTier: S.mutableKey(S.Union([S.String, S.Null])),
  language: S.mutableKey(S.Union([S.String, S.Null])),
  sourceFilePath: S.mutableKey(S.Union([S.String, S.Null])),
  sourceKind: S.mutableKey(TranscriptSourceKind),
  supersededAt: S.mutableKey(S.Union([S.Finite, S.Null])),
  createdAt: S.mutableKey(S.Finite),
  updatedAt: S.mutableKey(S.Finite),
  speakers: TranscriptSpeaker.pipe(S.Array, S.mutable, S.mutableKey),
  segments: TranscriptSegment.pipe(S.Array, S.mutable, S.mutableKey),
});
export type TranscriptRecord = typeof TranscriptRecord.Type;
export const TranscriptSummary = S.Struct({
  downloadTaskId: S.mutableKey(S.String),
  transcriptionTaskId: S.mutableKey(S.Union([S.String, S.Null])),
  transcriptId: S.mutableKey(S.Union([S.String, S.Null])),
  resultKind: S.mutableKey(S.Union([TranscriptResultKind, S.Null])),
  taskStatus: S.mutableKey(S.Union([S.String, S.Null])),
  stage: S.mutableKey(S.Union([TranscriptionStage, S.Null])),
});
export type TranscriptSummary = typeof TranscriptSummary.Type;
export const TranscriptionTaskOptions = S.Struct({
  provider: TranscriptionProvider.pipe(S.optional, S.mutableKey),
  cloudModelId: S.String.pipe(S.optional, S.mutableKey),
  downloadTaskId: S.mutableKey(S.String),
  sourceFilePath: S.mutableKey(S.String),
  trigger: S.mutableKey(TranscriptionTrigger),
  skipVad: S.Boolean.pipe(S.optional, S.mutableKey),
  asrTier: S.String.pipe(S.optional, S.mutableKey),
  language: S.String.pipe(S.optional, S.mutableKey),
  speakerCount: SpeakerCount.pipe(S.optional, S.mutableKey),
  rediarize: S.Boolean.pipe(S.optional, S.mutableKey),
});
export type TranscriptionTaskOptions = typeof TranscriptionTaskOptions.Type;
export const TranscriptSourceMeta = S.Struct({
  language: S.mutableKey(S.Union([S.String, S.Null])),
  resultKind: S.mutableKey(TranscriptResultKind),
  sourceKind: S.mutableKey(TranscriptSourceKind),
});
export type TranscriptSourceMeta = typeof TranscriptSourceMeta.Type;
export const TranscriptHead = S.Struct({
  ...TranscriptSourceMeta.fields,
  asrTier: S.mutableKey(S.Union([S.String, S.Null])),
  createdAt: S.mutableKey(S.Finite),
  downloadTaskId: S.mutableKey(S.String),
  id: S.mutableKey(S.String),
  modelVersion: S.mutableKey(S.String),
  sourceFilePath: S.mutableKey(S.Union([S.String, S.Null])),
  supersededAt: S.mutableKey(S.Union([S.Finite, S.Null])),
  transcriptionTaskId: S.mutableKey(S.String),
  updatedAt: S.mutableKey(S.Finite),
});
export type TranscriptHead = typeof TranscriptHead.Type;
export const TranscriptSegmentPatch = S.Struct({
  endMs: S.Finite.pipe(S.optional, S.mutableKey),
  speakerId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  startMs: S.Finite.pipe(S.optional, S.mutableKey),
  text: S.String.pipe(S.optional, S.mutableKey),
});
export type TranscriptSegmentPatch = typeof TranscriptSegmentPatch.Type;
export const InsertTranscriptSegmentInput = S.Struct({
  afterId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  atMs: S.Finite.pipe(S.optional, S.mutableKey),
  beforeId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  endMs: S.Finite.pipe(S.optional, S.mutableKey),
  speakerId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  startMs: S.Finite.pipe(S.optional, S.mutableKey),
  text: S.String.pipe(S.optional, S.mutableKey),
});
export type InsertTranscriptSegmentInput = typeof InsertTranscriptSegmentInput.Type;

export const StoredTranscriptRecord = S.Struct({
  ...TranscriptRecord.fields,
  resultKind: S.mutableKey(S.String),
});
export type StoredTranscriptRecord = typeof StoredTranscriptRecord.Type;
export const StoredTranscriptHead = S.Struct({
  ...TranscriptHead.fields,
  resultKind: S.mutableKey(S.String),
});
export type StoredTranscriptHead = typeof StoredTranscriptHead.Type;
export const TranscriptPlaybackCue = S.Struct({
  confidence: S.Finite.pipe(S.NullOr, S.mutableKey),
  id: S.mutableKey(S.String),
  sortIndex: S.mutableKey(S.Finite),
  speakerId: S.String.pipe(S.NullOr, S.mutableKey),
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
});
export type TranscriptPlaybackCue = typeof TranscriptPlaybackCue.Type;
