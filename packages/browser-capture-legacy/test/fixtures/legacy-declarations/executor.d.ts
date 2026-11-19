// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
import { type Executor, type ExecutorContext, type ExecutorEvents, type ExecutorRun } from '@vidbee/task-queue-legacy';
export interface BrowserCaptureExecutorOptions {
    resolveSidecarScript: () => string;
    resolveFfmpegPath: () => string;
    defaultDownloadDir: string;
    execPath?: string;
    execArgv?: string[];
    killGraceMs?: number;
    env?: NodeJS.ProcessEnv;
}
/**
 * Spawn the headed-browser sidecar and record the virtual display with ffmpeg.
 */
export declare class BrowserCaptureExecutor implements Executor {
    private readonly opts;
    constructor(options: BrowserCaptureExecutorOptions);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
    private execute;
}
