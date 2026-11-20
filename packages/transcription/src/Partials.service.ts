import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { TranscriptionStage } from "./Literal.model.js";
import type { PipelineSegment } from "./Pipeline.model.js";
import type { PartialTranscript, RestoredPartials, RestorePartialsInput } from "./Store.model.js";
import type { BoundaryDecodeError, HostFailure } from "./Transcription.errors.js";
export class PartialsManifest extends Context.Service<
  PartialsManifest,
  {
    readonly load: (workDir: string) => Effect.Effect<RestoredPartials, HostFailure | BoundaryDecodeError>;
  }
>()("@vidbee/transcription/Partials.service/PartialsManifest") {}
export class Partials extends Context.Service<
  Partials,
  {
    readonly set: (
      taskId: string,
      downloadTaskId: string,
      segments: PipelineSegment[]
    ) => Effect.Effect<PartialTranscript>;
    readonly setStage: (
      taskId: string,
      downloadTaskId: string,
      stage: TranscriptionStage
    ) => Effect.Effect<PartialTranscript>;
    readonly append: (
      taskId: string,
      downloadTaskId: string,
      segment: PipelineSegment
    ) => Effect.Effect<PartialTranscript>;
    readonly getByTask: (taskId: string) => Effect.Effect<PartialTranscript | null>;
    readonly getByDownload: (downloadTaskId: string) => Effect.Effect<PartialTranscript | null>;
    readonly clear: (taskId: string) => Effect.Effect<void>;
    readonly clearByDownload: (downloadTaskId: string) => Effect.Effect<void>;
    readonly restoreFromManifest: (
      input: RestorePartialsInput
    ) => Effect.Effect<PartialTranscript | null, HostFailure | BoundaryDecodeError>;
  }
>()("@vidbee/transcription/Partials.service/Partials") {}
