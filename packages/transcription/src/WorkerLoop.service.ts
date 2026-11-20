import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { BoundaryDecodeError, HostFailure } from "./Transcription.errors.js";
export class WorkerLoop extends Context.Service<
  WorkerLoop,
  {
    readonly run: (signal: AbortSignal, cancel: () => void) => Effect.Effect<void, HostFailure | BoundaryDecodeError>;
  }
>()("@vidbee/transcription/WorkerLoop.service/WorkerLoop") {}
