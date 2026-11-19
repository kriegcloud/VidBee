import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
import type { DisplaySize } from "./VirtualDisplay.model.js";
export interface DisplayHandle {
  readonly display: string;
  readonly pulseSink: string | undefined;
  readonly stop: Effect.Effect<void, CaptureError>;
}
export class VirtualDisplay extends Context.Service<
  VirtualDisplay,
  {
    readonly start: (input: DisplaySize) => Effect.Effect<DisplayHandle, CaptureError>;
  }
>()("@vidbee/browser-capture/VirtualDisplay.service/VirtualDisplay") {}
