import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError, HostFailure } from "./Capture.errors.js";
import type { HostSnapshot } from "./Host.model.js";
export class CaptureHost extends Context.Service<
  CaptureHost,
  {
    readonly available: Effect.Effect<boolean, CaptureError>;
    readonly browser: (preference?: string) => Effect.Effect<string | null, CaptureError>;
    readonly xvfb: Effect.Effect<string | null, CaptureError>;
    readonly pactl: Effect.Effect<string | null, CaptureError>;
    readonly displayNumber: Effect.Effect<number, CaptureError>;
    readonly snapshot: Effect.Effect<HostSnapshot, HostFailure>;
    readonly probeDisplay: (display: string, timeoutMs: number) => Effect.Effect<boolean, HostFailure>;
    readonly makeAbortController: () => AbortController;
  }
>()("@vidbee/browser-capture/CaptureHost.service/CaptureHost") {}
export class CaptureHostDriver extends Context.Service<
  CaptureHostDriver,
  {
    readonly snapshot: Effect.Effect<HostSnapshot, HostFailure>;
    readonly which: (binary: string) => Effect.Effect<string | null, HostFailure>;
    readonly exists: (path: string) => Effect.Effect<boolean, HostFailure>;
    readonly probeDisplay: (display: string, timeoutMs: number) => Effect.Effect<boolean, HostFailure>;
    readonly makeAbortController: () => AbortController;
  }
>()("@vidbee/browser-capture/CaptureHost.service/CaptureHostDriver") {}
