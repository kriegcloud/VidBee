import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { TranscriptionStage } from "./Literal.model.js";
import type { PipelineSegment } from "./Pipeline.model.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";
import type { WorkerProcessRun } from "./TranscriptionProcess.service.js";
import type { WorkerAttemptInput, WorkerAttemptResult, WorkerExitFailure } from "./WorkerAttempt.model.js";
export interface WorkerAttemptSink {
  readonly attach: (run: WorkerProcessRun | null, expected?: WorkerProcessRun) => Effect.Effect<void>;
  readonly ffmpegPath?: Effect.Effect<string, HostFailure> | undefined;
  readonly heartbeat: Effect.Effect<void, HostFailure>;
  readonly log: (stream: "stdout" | "stderr", line: string) => Effect.Effect<void, HostFailure>;
  readonly partial: (segment: PipelineSegment) => Effect.Effect<void, HostFailure>;
  readonly progress: (
    stage: TranscriptionStage,
    percent: number | null,
    ticks: number
  ) => Effect.Effect<void, HostFailure>;
  readonly stderr: (text: string) => Effect.Effect<void>;
  readonly stderrTail: () => string;
}
export class WorkerAttempt extends Context.Service<
  WorkerAttempt,
  {
    readonly run: (
      input: WorkerAttemptInput,
      sink: WorkerAttemptSink
    ) => Effect.Effect<WorkerAttemptResult, TranscriptionError | WorkerExitFailure>;
  }
>()("@vidbee/transcription/WorkerAttempt.service/WorkerAttempt") {}
