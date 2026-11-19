import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { WorkerLogStream } from "./Literal.model.js";
import type { PipelineProgress, PipelineResult, PipelineSegment } from "./Pipeline.model.js";
import type { PipelineInput } from "./PipelineInput.model.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";
export interface TranscriptionSink {
  readonly log: (stream: WorkerLogStream, line: string) => Effect.Effect<void, HostFailure>;
  readonly partial: (segment: PipelineSegment) => Effect.Effect<void, HostFailure>;
  readonly progress: (progress: PipelineProgress) => Effect.Effect<void, HostFailure>;
}
export class Pipeline extends Context.Service<
  Pipeline,
  {
    readonly run: (input: PipelineInput, sink: TranscriptionSink) => Effect.Effect<PipelineResult, TranscriptionError>;
  }
>()("@vidbee/transcription/Pipeline.service/Pipeline") {}
