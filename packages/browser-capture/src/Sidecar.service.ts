import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
import type { SidecarEvent } from "./Protocol.model.js";
export interface SidecarSink {
  readonly emit: (event: SidecarEvent) => Effect.Effect<void, CaptureError>;
}
export class SidecarJson extends Context.Service<
  SidecarJson,
  {
    readonly parse: (text: string) => Effect.Effect<unknown, CaptureError>;
  }
>()("@vidbee/browser-capture/Sidecar.service/SidecarJson") {}
