import { TaskCreationMetadata, TaskPriority } from "@vidbee/task-queue/Task.model";
import * as S from "effect/Schema";
import { SpeakerCount, TranscriptionProvider, TranscriptionTrigger } from "./Literal.model.js";
export const EnqueueTranscriptionInput = S.Struct({
  provider: S.optional(TranscriptionProvider),
  cloudModelId: S.optional(S.String),
  creation: S.optional(TaskCreationMetadata),
  downloadTaskId: S.String,
  sourceFilePath: S.String,
  title: S.optional(S.String),
  trigger: TranscriptionTrigger,
  priority: S.optional(TaskPriority),
  asrTier: S.optional(S.String),
  language: S.optional(S.String),
  speakerCount: S.optional(SpeakerCount),
  rediarize: S.optional(S.Boolean),
});
export type EnqueueTranscriptionInput = typeof EnqueueTranscriptionInput.Type;
export const EnqueueTranscriptionResult = S.Struct({ id: S.String, created: S.Boolean, reused: S.Boolean });
export type EnqueueTranscriptionResult = typeof EnqueueTranscriptionResult.Type;
