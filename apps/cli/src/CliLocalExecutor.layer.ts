import { HostFailure } from "@vidbee/downloader-core/Downloader.errors";
import { DownloadFilesLive } from "@vidbee/downloader-core/DownloadFiles.layer";
import { DownloadHost } from "@vidbee/downloader-core/DownloadHost.service";
import { DownloadTimingLive } from "@vidbee/downloader-core/DownloadTiming.service";
import { YtDlpTaskOptions } from "@vidbee/downloader-core/ExecutorOptions.model";
import * as Process from "@vidbee/downloader-core/Process.driver";
import * as Executor from "@vidbee/downloader-core/YtDlpExecutor.layer";
import { YtDlpExecutorHost } from "@vidbee/downloader-core/YtDlpExecutorHost.service";
import * as Wrapper from "@vidbee/downloader-core/YtDlpProcess.layer";
import { buildDownloadArgs, resolveSubtitleDownloadSkipReason } from "@vidbee/downloader-core/yt-dlp-args";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CliHost } from "./CliHost.service.js";
import type { LocalClientOptions } from "./Connection.model.js";

/** Native preparation; raw argv has precedence over generated download options. */
export const executorHostLayer = (options: LocalClientOptions) =>
  Layer.effect(
    YtDlpExecutorHost,
    Effect.gen(function* () {
      const cli = yield* CliHost;
      const downloadHost = yield* DownloadHost;
      const path = yield* Path.Path;
      const clock = yield* Clock.Clock;
      const dependencies = yield* Effect.context<
        DownloadHost | import("@vidbee/downloader-core/DownloadFiles.service").DownloadFiles | Path.Path
      >();
      const failure = (cause: unknown) =>
        HostFailure.make({ operation: "buildArgs", cause, legacyMessage: String(cause) });
      return YtDlpExecutorHost.of({
        platform: cli.platform,
        now: () => clock.currentTimeMillisUnsafe(),
        parseDate: (value) =>
          Option.match(DateTime.make(value), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis }),
        killGraceMs: 10_000,
        prepareSettings: undefined,
        binary: cli.environment("YTDLP_PATH").pipe(Effect.map((value) => options.ytDlpPath ?? value ?? "yt-dlp")),
        ffmpeg: cli.environment("FFMPEG_PATH").pipe(Effect.map((value) => options.ffmpegLocation ?? value)),
        cancellation: Effect.sync(() => {
          const controller = downloadHost.makeAbortController();
          return { signal: controller.signal, abort: Effect.sync(() => controller.abort()) };
        }),
        lowerPriority: Effect.fn("CliLocal.lowerPriority")(() => Effect.void),
        command: Effect.fn("CliLocal.command")(function* (input) {
          if (input.rawArgs !== undefined && input.rawArgs.length > 0)
            return {
              args: [...input.rawArgs],
              settings: yield* S.decodeUnknownEffect(YtDlpTaskOptions.fields.settings)(input.options?.settings).pipe(
                Effect.map((settings) => settings ?? {})
              ),
              initialSubtitleStatus: undefined,
              canRetryWithoutSubtitles: false,
            };
          const opts = yield* S.decodeEffect(YtDlpTaskOptions)(input.options ?? {});
          const settings = opts.settings ?? {};
          const type = opts.type ?? (input.kind === "audio" ? "audio" : "video");
          const defaultDir = options.defaultDownloadDir ?? path.join(cli.homeDirectory, "Downloads", "VidBeep");
          const downloadPath =
            (opts.customDownloadPath === undefined ? "" : Str.trim(opts.customDownloadPath)) ||
            (settings.downloadPath === undefined ? "" : Str.trim(settings.downloadPath)) ||
            defaultDir;
          const args = yield* buildDownloadArgs(
            {
              ...opts,
              audioFormatIds: opts.audioFormatIds === undefined ? undefined : [...opts.audioFormatIds],
              url: input.url,
              type,
            },
            defaultDir,
            { ...settings, downloadPath },
            []
          ).pipe(Effect.provide(dependencies));
          const skipped = resolveSubtitleDownloadSkipReason(
            { type, url: input.url },
            settings,
            settings.browserForCookies ?? "none"
          );
          return {
            args,
            settings,
            initialSubtitleStatus: skipped === "auth-required" ? ("skipped-auth" as const) : undefined,
            canRetryWithoutSubtitles: true,
          };
        }, Effect.mapError(failure)),
      });
    })
  );

export const executorLayer = (options: LocalClientOptions) => {
  const host = executorHostLayer(options);
  const files = DownloadFilesLive;
  const process = Wrapper.layer.pipe(Layer.provide(Process.layer.pipe(Layer.provide(requestLayer))));
  return Executor.layer.pipe(
    Layer.provide(Layer.mergeAll(host.pipe(Layer.provide(files)), files, process, DownloadTimingLive))
  );
};
