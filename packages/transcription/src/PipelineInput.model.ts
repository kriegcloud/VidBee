import * as S from "effect/Schema";
import { AsrTierId, SherpaExecutionProvider, SpeakerCount } from "./Literal.model.js";
import { PipelineResult } from "./Pipeline.model.js";
import { PipelineSeed } from "./Seed.model.js";
export const PipelineInput = S.Struct({
  sourceFilePath: S.String,
  wavPath: S.String,
  durationMs: S.Finite,
  skipVad: S.Boolean,
  autoSkipAllowed: S.Boolean,
  signal: S.optional(S.instanceOf(AbortSignal)),
  manifestPath: S.optional(S.String),
  asrTier: S.optional(AsrTierId),
  language: S.optional(S.String),
  speakerCount: S.optional(SpeakerCount),
  existingTranscript: S.optional(PipelineSeed),
});
export type PipelineInput = typeof PipelineInput.Type;
export const FakePipelineOptions = S.Struct({
  result: S.optional(PipelineResult),
  speech: S.optional(S.Boolean),
  delayMs: S.optional(S.Finite),
});
export type FakePipelineOptions = typeof FakePipelineOptions.Type;
export const SherpaPipelineOptions = S.Struct({ provider: S.optional(SherpaExecutionProvider) });
export type SherpaPipelineOptions = typeof SherpaPipelineOptions.Type;
