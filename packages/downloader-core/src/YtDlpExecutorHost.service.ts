import * as Context from "effect/Context";
import type { TaskInput } from "@vidbee/task-queue/Task.model";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";
import type { DownloadRuntimeSettings } from "./types.js";

export interface ExecutorCancellation {
  readonly abort: Effect.Effect<void>;
  readonly signal: AbortSignal;
}
export interface YtDlpCommand {
  readonly args: string[];
  readonly canRetryWithoutSubtitles: boolean;
  readonly initialSubtitleStatus: "skipped-auth" | undefined;
  readonly settings: DownloadRuntimeSettings;
}
/** Host hooks execute at their original call positions; preparation is the only optional suspension. */
export class YtDlpExecutorHost extends Context.Service<
  YtDlpExecutorHost,
  {
    readonly now: () => number;
    readonly parseDate: (value: string) => number;
    readonly killGraceMs: number;
    readonly platform: string;
    readonly prepareSettings:
      | ((input: TaskInput) => Effect.Effect<DownloadRuntimeSettings | undefined, HostFailure>)
      | undefined;
    readonly command: (
      input: TaskInput,
      settings?: DownloadRuntimeSettings
    ) => Effect.Effect<YtDlpCommand, HostFailure>;
    readonly binary: Effect.Effect<string, HostFailure>;
    readonly ffmpeg: Effect.Effect<string | undefined, HostFailure>;
    readonly cancellation: Effect.Effect<ExecutorCancellation>;
    readonly lowerPriority: (pid: number | undefined) => Effect.Effect<void>;
  }
>()("@vidbee/downloader-core/YtDlpExecutorHost.service/YtDlpExecutorHost") {}
