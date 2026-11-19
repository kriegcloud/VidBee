import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
export type Cancel = Effect.Effect<void>;
export class CaptureTimers extends Context.Service<
  CaptureTimers,
  {
    readonly now: Effect.Effect<number>;
    readonly sleepProbe?: ((ms: number) => Effect.Effect<void>) | undefined;
    readonly sleep: (ms: number) => Effect.Effect<void>;
    readonly defer: (
      action: Effect.Effect<void, CaptureError>,
      options?: { readonly rejectOnFailure: boolean }
    ) => Effect.Effect<void>;
    readonly after: (
      ms: number,
      action: Effect.Effect<void, CaptureError>,
      options: { readonly keepAlive: boolean }
    ) => Effect.Effect<Cancel, CaptureError>;
  }
>()("@vidbee/browser-capture/CaptureTimers.service/CaptureTimers") {}
