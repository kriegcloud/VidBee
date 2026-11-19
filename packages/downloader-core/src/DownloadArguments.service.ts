import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure, InvalidDownload } from "./Downloader.errors.js";
import type { YtDlpDownloadOptions, YtDlpDownloadSettings } from "./yt-dlp-args.js";

/** Host-dependent argument builders, preserving option ordering. */
export class DownloadArguments extends Context.Service<
  DownloadArguments,
  {
    readonly download: (
      options: YtDlpDownloadOptions,
      fallbackPath: string,
      settings: YtDlpDownloadSettings,
      runtimeArgs?: string[]
    ) => Effect.Effect<string[], InvalidDownload | HostFailure>;
    readonly videoInfo: (
      url: string,
      settings: YtDlpDownloadSettings,
      runtimeArgs?: string[]
    ) => Effect.Effect<string[], InvalidDownload | HostFailure>;
    readonly playlistInfo: (
      url: string,
      settings: YtDlpDownloadSettings,
      runtimeArgs?: string[]
    ) => Effect.Effect<string[], InvalidDownload | HostFailure>;
    readonly captions: (
      url: string,
      template: string,
      settings: YtDlpDownloadSettings,
      runtimeArgs?: string[],
      languages?: readonly string[]
    ) => Effect.Effect<string[], InvalidDownload | HostFailure>;
  }
>()("@vidbee/downloader-core/DownloadArguments.service/DownloadArguments") {}
