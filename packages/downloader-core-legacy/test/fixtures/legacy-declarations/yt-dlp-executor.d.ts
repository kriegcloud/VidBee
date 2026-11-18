import type { Executor, ExecutorContext, ExecutorEvents, ExecutorRun, TaskInput } from '@vidbee/task-queue-legacy';
import type { OneClickContainerOption } from './format-preferences';
import type { DownloadRuntimeSettings } from './types';
import { type YtDlpProgressPayload } from './yt-dlp-progress';
interface YtDlpExecProcess {
    ytDlpProcess?: {
        pid?: number;
        stdout?: NodeJS.ReadableStream;
        stderr?: NodeJS.ReadableStream;
        kill: (signal?: NodeJS.Signals | number) => boolean;
    };
    on(event: 'progress', listener: (payload: YtDlpProgressPayload) => void): this;
    on(event: 'close', listener: (code: number | null) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    once(event: 'close', listener: (code: number | null) => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
}
/**
 * Per-task data hosts pack into `Task.input.options` when calling
 * `TaskQueueAPI.add({ input })`. Adapters that route through downloads.*
 * routes MUST shape options to this contract; `YtDlpExecutor` reads them
 * back out at spawn time.
 */
export interface YtDlpTaskOptions {
    type?: 'video' | 'audio';
    format?: string;
    audioFormat?: string;
    audioFormatIds?: readonly string[];
    startTime?: string;
    endTime?: string;
    customDownloadPath?: string;
    customFilenameTemplate?: string;
    containerFormat?: OneClickContainerOption;
    /** Per-task overrides on top of the executor's default DownloadRuntimeSettings. */
    settings?: DownloadRuntimeSettings;
    /**
     * Display-only metadata stored at create time. Surfaces back through the
     * legacy projection so renderers see the same fields they used to.
     */
    title?: string;
    thumbnail?: string;
    description?: string;
    channel?: string;
    uploader?: string;
    duration?: number;
    viewCount?: number;
    tags?: readonly string[];
    playlistTitle?: string;
    playlistSize?: number;
    mediaKind?: 'photo' | 'video' | 'recording';
    batchId?: string;
    batchKind?: 'instagram-profile';
    batchTitle?: string;
    batchCategory?: string;
    batchOrder?: number;
    batchSourceCount?: number;
    batchAssetCount?: number;
    galleryDlDirectoryTemplate?: string;
    galleryDlFilenameTemplate?: string;
    expectedAssetCount?: number;
    fileSize?: number;
    startedAt?: number;
    completedAt?: number;
    downloadPath?: string;
}
export interface YtDlpExecutorOptions {
    /** yt-dlp binary path. Resolved lazily so adapters can pick one up after
     *  startup (e.g. desktop's auto-installer). */
    resolveYtDlpPath: () => string;
    /** ffmpeg directory; passed to yt-dlp via `--ffmpeg-location`. Lazy. */
    resolveFfmpegLocation: () => string | undefined;
    /** Default download dir if a task does not provide one. */
    defaultDownloadDir: string;
    /** Default runtime settings (cookies, proxy, embed flags). */
    defaultRuntimeSettings?: DownloadRuntimeSettings;
    /**
     * Extra argv injected after `buildDownloadArgs` (e.g. `--js-runtimes deno:/path`)
     * so adapters can plumb their own runtime resolution.
     */
    extraArgs?: () => readonly string[];
    /**
     * Override args builder. Mostly used by the CLI's `yt-dlp-forward` flow
     * which passes raw argv unchanged.
     */
    buildArgs?: (input: TaskInput, defaultDownloadDir: string) => string[];
    /**
     * Optional host hook that can replace cookies/proxy settings immediately
     * before yt-dlp starts, including retries.
     */
    prepareSettings?: (input: TaskInput) => Promise<DownloadRuntimeSettings | undefined>;
    /** Grace period between SIGTERM and SIGKILL. Default 10s. */
    killGraceMs?: number;
    /** Test seam. Defaults to Date.now. */
    clock?: () => number;
    /** Test seam: override the yt-dlp-wrap-plus invocation. */
    spawnFn?: (binaryPath: string, args: string[], signal: AbortSignal) => YtDlpExecProcess;
}
export declare class YtDlpExecutor implements Executor {
    private readonly opts;
    private cachedYtDlp;
    private cachedYtDlpPath;
    constructor(options: YtDlpExecutorOptions);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
    /** Merge host defaults with per-task runtime setting overrides. */
    private resolveRuntimeSettings;
    /** Detect user-visible subtitle skips that happen before yt-dlp starts. */
    private resolveInitialSubtitleStatus;
    /** Build the final yt-dlp arguments for one task input. */
    private buildArgsFor;
    /** Diagnostic: return the resolved argv yt-dlp would be invoked with. */
    describeCommandFor(input: TaskInput): string;
    private getYtDlp;
}
export type { ExecutorContext, ExecutorEvents, ExecutorRun, TaskInput };
