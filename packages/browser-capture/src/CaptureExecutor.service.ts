import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
export interface BrowserCaptureOptions {
  readonly defaultDownloadDir: string;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly execArgv?: readonly string[] | undefined;
  readonly execPath?: string | undefined;
  readonly killGraceMs?: number | undefined;
  readonly resolveFfmpegPath: Effect.Effect<string, CaptureError>;
  readonly resolveSidecarScript: Effect.Effect<string, CaptureError>;
}
export class CaptureExecutorOptions extends Context.Service<CaptureExecutorOptions, BrowserCaptureOptions>()(
  "@vidbee/browser-capture/CaptureExecutor.service/CaptureExecutorOptions"
) {}
