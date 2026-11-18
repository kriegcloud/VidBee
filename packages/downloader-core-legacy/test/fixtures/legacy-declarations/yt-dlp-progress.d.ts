import type { TaskProgress } from '@vidbee/task-queue-legacy';
/**
 * Raw progress object emitted by yt-dlp-wrap-plus.
 *
 * The wrap regex copies `totalSize` (not `total`) and never fills
 * `downloaded`. Callers may also pass the names we use internally.
 */
export interface YtDlpProgressPayload {
    percent?: number;
    currentSpeed?: string;
    eta?: string;
    downloaded?: string;
    total?: string;
    totalSize?: string;
}
interface ParsedYtDlpProgress {
    percent: number | null;
    bytesDownloaded: number | null;
    bytesTotal: number | null;
    speedBps: number | null;
    etaMs: number | null;
}
/**
 * Parse a yt-dlp-wrap progress event into TaskProgress units (percent 0..1).
 *
 * Rejects wrap false-positives such as `Downloading 234 fragments of 234`,
 * which `parseFloat` turns into NaN.
 */
export declare function parseYtDlpProgressPayload(payload: YtDlpProgressPayload): ParsedYtDlpProgress;
/**
 * Fold per-file / per-fragment yt-dlp percents into a single overall
 * TaskProgress that does not jump backwards in the UI.
 *
 * yt-dlp-wrap-plus reports the current output file (video, then audio,
 * then sidecars) and HLS/DASH estimates can revise the total, so a raw
 * passthrough makes the bar bounce while the download is still heading
 * toward 100%.
 */
export declare class DownloadProgressAggregator {
    private highWater;
    private maxTotal;
    private completedBytes;
    private currentDownloaded;
    private currentTotal;
    private ticks;
    /**
     * Apply one wrap progress event. Returns null when the event is junk
     * and the previous overall progress should be kept.
     */
    apply(payload: YtDlpProgressPayload): TaskProgress | null;
    /** Overall 0..1 from accumulated bytes, or the current file percent. */
    private overallPercent;
    /** Remember the largest total and current-file byte counters. */
    private rememberCurrentFile;
    /**
     * True when a much larger file appears after a thumbnail/json sidecar so
     * we should follow the media file instead of keeping a fake 100%.
     */
    private isLargeFileTakeover;
    /**
     * True when video finished and a substantial next file (usually audio)
     * starts at ~0%. Fragments of a known large file do not match.
     */
    private isNewMediaStream;
    /** Build a TaskProgress snapshot, bumping the tick counter. */
    private snapshot;
}
/** Parse a yt-dlp size token such as `1.55MiB` or `512KiB`. */
export declare function parseSize(value: string | undefined): number | null;
/** Parse a yt-dlp speed token such as `1.55MiB/s`. */
export declare function parseSpeed(value: string | undefined): number | null;
/** Parse a yt-dlp ETA token (`MM:SS` or `HH:MM:SS`) into milliseconds. */
export declare function parseEtaMs(value: string | undefined): number | null;
export {};
