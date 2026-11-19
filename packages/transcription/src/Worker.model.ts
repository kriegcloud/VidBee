import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import { AsrTierId, SherpaExecutionProvider, SpeakerCount, TranscriptionStage } from "./Literal.model.js";
import { PipelineResult } from "./Pipeline.model.js";
import { TranscriptWord } from "./Transcript.model.js";
export const WorkerStartMessage = S.Struct({
  type: S.mutableKey(S.Literal("start")),
  taskId: S.mutableKey(S.String),
  attemptId: S.mutableKey(S.String),
  sourceFilePath: S.mutableKey(S.String),
  ffmpegPath: S.mutableKey(S.String),
  workDir: S.mutableKey(S.String),
  modelsDir: S.mutableKey(S.String),
  skipVad: S.mutableKey(S.Boolean),
  autoSkipAllowed: S.mutableKey(S.Boolean),
  backend: S.mutableKey(LiteralKit(["sherpa", "fake"])),
  fingerprint: S.mutableKey(S.String),
  modelVersion: S.mutableKey(S.String),
  asrTier: S.mutableKey(AsrTierId),
  provider: S.mutableKey(SherpaExecutionProvider),
  language: S.String.pipe(S.optional, S.mutableKey),
  speakerCount: SpeakerCount.pipe(S.optional, S.mutableKey),
  existingTranscriptPath: S.String.pipe(S.optional, S.mutableKey),
});
export type WorkerStartMessage = typeof WorkerStartMessage.Type;
export const WorkerProbeMessage = S.Struct({
  type: S.mutableKey(S.Literal("probe")),
  modelsDir: S.mutableKey(S.String),
  asrTier: AsrTierId.pipe(S.optional, S.mutableKey),
  benchmark: S.Boolean.pipe(S.optional, S.mutableKey),
  provider: SherpaExecutionProvider.pipe(S.optional, S.mutableKey),
});
export type WorkerProbeMessage = typeof WorkerProbeMessage.Type;
export const WorkerCancelMessage = S.Struct({
  type: S.mutableKey(S.Literal("cancel")),
});
export type WorkerCancelMessage = typeof WorkerCancelMessage.Type;
export const WorkerProgressMessage = S.Struct({
  type: S.mutableKey(S.Literal("progress")),
  stage: S.mutableKey(TranscriptionStage),
  percent: S.mutableKey(S.Union([S.Finite, S.Null])),
  message: S.String.pipe(S.optional, S.mutableKey),
});
export type WorkerProgressMessage = typeof WorkerProgressMessage.Type;
export const WorkerPartialMessage = S.Struct({
  type: S.mutableKey(S.Literal("partial")),
  speakerKey: S.mutableKey(S.Union([S.String, S.Null])),
  startMs: S.mutableKey(S.Finite),
  endMs: S.mutableKey(S.Finite),
  text: S.mutableKey(S.String),
  words: TranscriptWord.pipe(S.Array, S.mutable, S.optional, S.mutableKey),
});
export type WorkerPartialMessage = typeof WorkerPartialMessage.Type;
export const WorkerResultMessage = S.Struct({
  type: S.mutableKey(S.Literal("result")),
  result: PipelineResult.pipe(S.optional, S.mutableKey),
  resultPath: S.String.pipe(S.optional, S.mutableKey),
  durationMs: S.mutableKey(S.Finite),
});
export type WorkerResultMessage = typeof WorkerResultMessage.Type;
export const WorkerErrorMessage = S.Struct({
  type: S.mutableKey(S.Literal("error")),
  message: S.mutableKey(S.String),
});
export type WorkerErrorMessage = typeof WorkerErrorMessage.Type;
export const WorkerLogMessage = S.Struct({
  type: S.mutableKey(S.Literal("log")),
  stream: S.mutableKey(LiteralKit(["stdout", "stderr"])),
  line: S.mutableKey(S.String),
});
export type WorkerLogMessage = typeof WorkerLogMessage.Type;
export const WorkerProbeOkMessage = S.Struct({
  type: S.mutableKey(S.Literal("probe-ok")),
  durationMs: S.Finite.pipe(S.optional, S.mutableKey),
  provider: SherpaExecutionProvider.pipe(S.optional, S.mutableKey),
});
export type WorkerProbeOkMessage = typeof WorkerProbeOkMessage.Type;
export const WorkerInbound = S.Union([WorkerStartMessage, WorkerProbeMessage, WorkerCancelMessage]);
export type WorkerInbound = typeof WorkerInbound.Type;
export const WorkerOutbound = S.Union([
  WorkerProgressMessage,
  WorkerPartialMessage,
  WorkerResultMessage,
  WorkerErrorMessage,
  WorkerLogMessage,
  WorkerProbeOkMessage,
]);
export type WorkerOutbound = typeof WorkerOutbound.Type;

/** Result payloads remain unknown until the selected inline/file payload is consumed. */
export const WorkerWireResult = S.Struct({
  type: S.Literal("result"),
  result: S.optional(S.Unknown),
  resultPath: S.optional(S.Unknown),
  durationMs: S.Finite,
});
export type WorkerWireResult = typeof WorkerWireResult.Type;
export const WorkerWireProbeOk = S.Struct({
  type: S.Literal("probe-ok"),
  durationMs: S.optional(S.Unknown),
  provider: S.optional(S.Unknown),
});
export const WorkerWireOutbound = S.Union([
  WorkerProgressMessage,
  WorkerPartialMessage,
  WorkerWireResult,
  WorkerErrorMessage,
  WorkerLogMessage,
  WorkerWireProbeOk,
]);
export type WorkerWireOutbound = typeof WorkerWireOutbound.Type;

/** Fake probes consume no configuration; real probes decode their configuration after dispatch. */
export const WorkerWireProbe = S.StructWithRest(
  S.Struct({
    type: S.Literal("probe"),
    modelsDir: S.optional(S.Unknown),
    asrTier: S.optional(S.Unknown),
    benchmark: S.optional(S.Unknown),
    provider: S.optional(S.Unknown),
  }),
  [S.Record(S.String, S.Unknown)]
);
export type WorkerWireProbe = typeof WorkerWireProbe.Type;
export const WorkerWireInbound = S.Union([WorkerStartMessage, WorkerWireProbe, WorkerCancelMessage]);
export type WorkerWireInbound = typeof WorkerWireInbound.Type;
