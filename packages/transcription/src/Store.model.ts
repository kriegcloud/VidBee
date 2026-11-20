import * as S from "effect/Schema";
import { ManifestChunk } from "./Checkpoint.model.js";
import { PipelineResult, PipelineSegment } from "./Pipeline.model.js";
import { StoredTranscriptRecord, TranscriptStageTiming } from "./Transcript.model.js";
export const TranscriptCommit = S.Struct({
  downloadTaskId: S.String,
  transcriptionTaskId: S.String,
  sourceFilePath: S.NullOr(S.String),
  result: PipelineResult,
  transcriptId: S.optional(S.String),
  activate: S.optional(S.Boolean),
});
export type TranscriptCommit = typeof TranscriptCommit.Type;
export const CaptionCue = S.Struct({ startMs: S.Finite, endMs: S.Finite, text: S.String });
export type CaptionCue = typeof CaptionCue.Type;
export const InsertedTranscriptSegment = S.Struct({ record: StoredTranscriptRecord, segmentId: S.String });
export type InsertedTranscriptSegment = typeof InsertedTranscriptSegment.Type;
export const PartialTranscript = S.Struct({
  taskId: S.mutableKey(S.String),
  downloadTaskId: S.mutableKey(S.String),
  segments: PipelineSegment.pipe(S.Array, S.mutable, S.mutableKey),
  stage: S.String.pipe(S.NullOr, S.mutableKey),
  stageHistory: TranscriptStageTiming.pipe(S.Array, S.mutable, S.mutableKey),
});
export type PartialTranscript = typeof PartialTranscript.Type;
export const RestorePartialsInput = S.Struct({ taskId: S.String, downloadTaskId: S.String, workDir: S.String });
export type RestorePartialsInput = typeof RestorePartialsInput.Type;

export const RestoredPartials = S.Struct({
  chunks: ManifestChunk.pipe(S.Array, S.mutable),
  stages: TranscriptStageTiming.pipe(S.Array, S.mutable),
});
export type RestoredPartials = typeof RestoredPartials.Type;
