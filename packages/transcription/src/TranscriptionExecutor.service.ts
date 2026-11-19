import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { GpuKind, TranscriptionStage } from "./Literal.model.js";
import type { PipelineSegment } from "./Pipeline.model.js";
import type { HostFailure } from "./Transcription.errors.js";
import type { InlineExecutionInput, InlineExecutionResult, StageNotification } from "./TranscriptionExecutor.model.js";

export { TaskExecutor as TranscriptionExecutor } from "@vidbee/task-queue/TaskExecutor.service";
export interface InlineExecutionSink {
  readonly partial: (segment: PipelineSegment) => Effect.Effect<void, HostFailure>;
  readonly progress: (stage: TranscriptionStage, percent: number | null) => Effect.Effect<void, HostFailure>;
}
export interface ExecutionResult extends InlineExecutionResult {
  readonly cleanup?: Effect.Effect<void, HostFailure> | undefined;
}
export class ExecutorHooks extends Context.Service<
  ExecutorHooks,
  {
    readonly ffmpegPath: Effect.Effect<string, HostFailure>;
    readonly gpuKinds: Effect.Effect<readonly GpuKind[], HostFailure>;
    readonly cloud:
      | ((input: InlineExecutionInput, sink: InlineExecutionSink) => Effect.Effect<ExecutionResult, HostFailure>)
      | undefined;
    readonly inProcess:
      | ((input: InlineExecutionInput, sink: InlineExecutionSink) => Effect.Effect<ExecutionResult, HostFailure>)
      | undefined;
    readonly onPartial: (input: {
      taskId: string;
      downloadTaskId: string;
      segments: PipelineSegment[];
    }) => Effect.Effect<void>;
    readonly onStage: (input: StageNotification) => Effect.Effect<void>;
    readonly removeScratch: (path: string) => Effect.Effect<void>;
  }
>()("@vidbee/transcription/TranscriptionExecutor.service/ExecutorHooks") {}

export class ExecutorCommit extends Context.Service<
  ExecutorCommit,
  Pick<typeof import("./TranscriptStore.service.js").TranscriptStore.Service, "commit">
>()("@vidbee/transcription/TranscriptionExecutor.service/ExecutorCommit") {}
