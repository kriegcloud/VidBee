import * as S from "effect/Schema";
import { SpeakerCount, TranscriptionBackend, TranscriptionStage, WorkerRuntimeLayer } from "./Literal.model.js";
import { PipelineResult } from "./Pipeline.model.js";
import { PipelineSeed } from "./Seed.model.js";
import { Environment } from "./TranscriptionHost.model.js";
export const TranscriptionExecutorConfig = S.Struct({
  workerScript: S.String,
  modelsDir: S.String,
  backend: S.optional(TranscriptionBackend),
  execPath: S.optional(S.String),
  execArgv: S.String.pipe(S.Array, S.mutable, S.optional),
  env: S.optional(Environment),
  workDir: S.optional(S.String),
  bundledNodePath: S.String.pipe(S.NullOr, S.optional),
  forceLayer: S.optional(WorkerRuntimeLayer),
  maxWorkerRestarts: S.optional(S.Finite),
  skipProbe: S.optional(S.Boolean),
});
export type TranscriptionExecutorConfig = typeof TranscriptionExecutorConfig.Type;
export const InlineExecutionInput = S.Struct({
  taskId: S.String,
  sourceFilePath: S.String,
  modelId: S.String,
  skipVad: S.Boolean,
  autoSkipAllowed: S.Boolean,
  asrTier: S.String,
  language: S.optional(S.String),
  speakerCount: S.optional(SpeakerCount),
  existingTranscript: S.optional(PipelineSeed),
  signal: S.instanceOf(AbortSignal),
});
export type InlineExecutionInput = typeof InlineExecutionInput.Type;
export const StageNotification = S.Struct({ taskId: S.String, downloadTaskId: S.String, stage: TranscriptionStage });
export type StageNotification = typeof StageNotification.Type;
export const InlineExecutionResult = S.Struct({ result: PipelineResult, durationMs: S.Finite });
export type InlineExecutionResult = typeof InlineExecutionResult.Type;
