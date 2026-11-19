import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
import type { Position } from "./Playback.model.js";
import type { RecorderStart, ScanInput } from "./Recorder.model.js";
export interface RecorderHandle {
  readonly stop: Effect.Effect<void, CaptureError>;
}
export class Recorder extends Context.Service<
  Recorder,
  {
    readonly scan: (input: ScanInput) => Effect.Effect<Position, CaptureError>;
    readonly start: (input: RecorderStart) => Effect.Effect<RecorderHandle, CaptureError>;
  }
>()("@vidbee/browser-capture/Recorder.service/Recorder") {}
