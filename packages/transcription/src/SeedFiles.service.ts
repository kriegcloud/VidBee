import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { PipelineSeed } from "./Seed.model.js";
import type { BoundaryDecodeError, CheckpointFailure, HostFailure } from "./Transcription.errors.js";
export class SeedFiles extends Context.Service<
  SeedFiles,
  {
    readonly load: (path: string) => Effect.Effect<PipelineSeed | null, HostFailure | BoundaryDecodeError>;
    readonly write: (path: string, seed: PipelineSeed) => Effect.Effect<void, HostFailure | CheckpointFailure>;
  }
>()("@vidbee/transcription/SeedFiles.service/SeedFiles") {}
