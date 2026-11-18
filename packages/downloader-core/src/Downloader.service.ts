import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DownloaderError } from "./Downloader.errors.js";
import type { CreateDownloadInput, DownloadTask } from "./types.js";

/** The in-memory downloader is independent from the task-queue executors. */
export class Downloader extends Context.Service<
  Downloader,
  {
    readonly initialize: Effect.Effect<void, DownloaderError>;
    readonly createDownload: (input: CreateDownloadInput) => Effect.Effect<DownloadTask, DownloaderError>;
    readonly cancelDownload: (id: string) => Effect.Effect<boolean, DownloaderError>;
    readonly listDownloads: Effect.Effect<DownloadTask[]>;
    readonly listHistory: Effect.Effect<DownloadTask[]>;
    readonly getStatus: Effect.Effect<{ active: number; pending: number }>;
    readonly removeHistoryItems: (ids: string[]) => Effect.Effect<number>;
    readonly removeHistoryByPlaylist: (id: string) => Effect.Effect<number>;
  }
>()("@vidbee/downloader-core/Downloader.service/Downloader") {}
