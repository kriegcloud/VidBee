import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CheckpointFailure, HostFailure } from "./Transcription.errors.js";
export class AtomicFiles extends Context.Service<
  AtomicFiles,
  {
    readonly stagingPath: (path: string) => Effect.Effect<string, HostFailure>;
    readonly publish: (temporary: string, destination: string) => Effect.Effect<void, HostFailure | CheckpointFailure>;
    readonly write: (path: string, data: Uint8Array | string) => Effect.Effect<void, HostFailure | CheckpointFailure>;
    readonly writeJson: (path: string, value: unknown) => Effect.Effect<void, HostFailure | CheckpointFailure>;
  }
>()("@vidbee/transcription/AtomicFiles.service/AtomicFiles") {}
