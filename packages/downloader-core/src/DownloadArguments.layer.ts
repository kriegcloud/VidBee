import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DownloadArguments } from "./DownloadArguments.service.js";
import {
  buildCaptionExtractArgs,
  buildDownloadArgs,
  buildPlaylistInfoArgs,
  buildVideoInfoArgs,
} from "./yt-dlp-args.js";
import type * as Path from "effect/Path";
import type { DownloadFiles } from "./DownloadFiles.service.js";
import type { DownloadHost } from "./DownloadHost.service.js";

export const DownloadArgumentsLive = Layer.effect(
  DownloadArguments,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<DownloadFiles | DownloadHost | Path.Path>();
    return DownloadArguments.of({
      download: Effect.fn("DownloadArguments.download")((...args) =>
        Effect.provide(buildDownloadArgs(...args), dependencies)
      ),
      videoInfo: Effect.fn("DownloadArguments.videoInfo")((...args) =>
        Effect.provide(buildVideoInfoArgs(...args), dependencies)
      ),
      playlistInfo: Effect.fn("DownloadArguments.playlistInfo")((...args) =>
        Effect.provide(buildPlaylistInfoArgs(...args), dependencies)
      ),
      captions: Effect.fn("DownloadArguments.captions")((...args) =>
        Effect.provide(buildCaptionExtractArgs(...args), dependencies)
      ),
    });
  })
);
