import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";
import type { DownloaderEvent, DownloaderInitialization } from "./Downloader.model.js";
import type { DownloadRuntimeSettings } from "./types.js";

export class DownloaderHost extends Context.Service<
  DownloaderHost,
  {
    readonly downloadDir: string;
    readonly maxConcurrent: number;
    readonly runtimeSettings: DownloadRuntimeSettings;
    readonly jsRuntimeArgs: string[];
    readonly platform: string;
    readonly initialize: Effect.Effect<DownloaderInitialization, HostFailure>;
    readonly now: () => number;
    readonly uuid: () => string;
    readonly cancellation: Effect.Effect<{ readonly signal: AbortSignal; readonly abort: Effect.Effect<void> }>;
    readonly lowerPriority: (pid: number | undefined) => Effect.Effect<void>;
    readonly emit: (event: DownloaderEvent) => Effect.Effect<void>;
  }
>()("@vidbee/downloader-core/DownloaderHost.service/DownloaderHost") {}
