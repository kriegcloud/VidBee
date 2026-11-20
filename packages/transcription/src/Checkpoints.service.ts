import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type {
  EnsureManifestInput,
  ManifestChunk,
  ManifestEnvelope,
  ManifestPatch,
  ManifestTurn,
} from "./Checkpoint.model.js";
import type { PipelineSpeaker } from "./Pipeline.model.js";
import type { TranscriptStageTiming } from "./Transcript.model.js";
import type { BoundaryDecodeError, CheckpointFailure, HostFailure } from "./Transcription.errors.js";
export type CheckpointError = BoundaryDecodeError | CheckpointFailure | HostFailure;
export class Checkpoints extends Context.Service<
  Checkpoints,
  {
    readonly sourceFingerprint: (path: string) => Effect.Effect<string, HostFailure>;
    readonly manifestPath: (workDir: string) => string;
    readonly stagesPath: (workDir: string) => string;
    readonly load: (path: string) => Effect.Effect<ManifestEnvelope | null, HostFailure>;
    readonly save: (path: string, manifest: ManifestEnvelope) => Effect.Effect<void, HostFailure | CheckpointFailure>;
    readonly ensure: (
      input: EnsureManifestInput
    ) => Effect.Effect<{ path: string; manifest: ManifestEnvelope }, CheckpointError>;
    readonly patch: (path: string, patch: ManifestPatch) => Effect.Effect<ManifestEnvelope, CheckpointError>;
    readonly append: (
      path: string,
      chunk: ManifestChunk,
      extras?: ManifestPatch
    ) => Effect.Effect<ManifestEnvelope, CheckpointError>;
    readonly loadStages: (workDir: string) => Effect.Effect<TranscriptStageTiming[] | null, HostFailure>;
    readonly saveStages: (
      workDir: string,
      stages: TranscriptStageTiming[]
    ) => Effect.Effect<void, HostFailure | CheckpointFailure>;
    readonly chunks: (manifest: ManifestEnvelope) => Effect.Effect<ManifestChunk[], BoundaryDecodeError>;
    readonly turns: (manifest: ManifestEnvelope) => Effect.Effect<ManifestTurn[], BoundaryDecodeError>;
    readonly speakers: (manifest: ManifestEnvelope) => Effect.Effect<PipelineSpeaker[], BoundaryDecodeError>;
  }
>()("@vidbee/transcription/Checkpoints.service/Checkpoints") {}
