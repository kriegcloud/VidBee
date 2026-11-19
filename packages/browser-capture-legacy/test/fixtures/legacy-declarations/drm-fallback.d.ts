// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
import type { Executor, ExecutorContext, ExecutorEvents, ExecutorRun } from '@vidbee/task-queue-legacy';
/**
 * Run yt-dlp (or another primary executor) first. When decoding is impossible
 * because of CDM DRM, fall back to recording headed Chromium on Xvfb.
 */
export declare class DrmFallbackExecutor implements Executor {
    private readonly primary;
    private readonly capture;
    private readonly isAvailable;
    constructor(primary: Executor, capture: Executor, isAvailable?: () => boolean);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
}
