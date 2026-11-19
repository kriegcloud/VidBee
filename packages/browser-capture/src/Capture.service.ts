import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
import type { CaptureJob, CaptureResult } from "./Capture.model.js";
import type { PlaybackProgress } from "./Playback.model.js";
export interface CaptureSink {
  readonly log: (message: string) => Effect.Effect<void, CaptureError>;
  readonly progress: (state: PlaybackProgress) => Effect.Effect<void, CaptureError>;
}
export class Capture extends Context.Service<
  Capture,
  {
    readonly run: (
      job: CaptureJob,
      signal: AbortSignal,
      sink: CaptureSink
    ) => Effect.Effect<CaptureResult, CaptureError>;
  }
>()("@vidbee/browser-capture/Capture.service/Capture") {}
