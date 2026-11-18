import { type Executor, type ExecutorContext, type ExecutorEvents, type ExecutorRun, type TaskKind } from '@vidbee/task-queue-legacy';
import type { DownloadRuntimeSettings } from './types';
import type { YtDlpTaskOptions } from './yt-dlp-executor';
export declare const VSCO_GALLERY_DL_EXTRACTOR_ARGS: readonly ['-o', 'extractor.vsco.tls12=true', '-o', 'extractor.vsco.videos=true', '--sleep-request', '1', '--sleep-429', '60', '--retries', '8'];
export declare const FACEBOOK_GALLERY_DL_EXTRACTOR_ARGS: readonly ['--sleep-request', '1', '--sleep-429', '60', '--retries', '8'];
/**
 * Photo-mode posts carry images plus the slideshow sound. Videos stay off so
 * gallery-dl never reaches for its optional ytdl module; yt-dlp owns TikTok video.
 */
export declare const TIKTOK_PHOTO_GALLERY_DL_EXTRACTOR_ARGS: readonly ['-o', 'extractor.tiktok.photos=true', '-o', 'extractor.tiktok.audio=true', '-o', 'extractor.tiktok.videos=false', '--sleep-429', '60', '--retries', '5'];
export interface NormalizedVscoGalleryUrl {
    username: string;
    profileUrl: string;
}
interface GalleryDlTaskOptions extends YtDlpTaskOptions {
    galleryDlBaseDirectory?: string;
    galleryDlDirectorySegments?: readonly string[];
    galleryDlDirectoryTemplate?: string;
    galleryDlFilenameTemplate?: string;
    galleryDlFilter?: string;
    expectedAssetCount?: number;
}
export interface GalleryDlExecutorOptions {
    resolveBinaryPath: () => string;
    defaultDownloadDir: string;
    resolveExtraArgs?: (settings?: DownloadRuntimeSettings, url?: string) => readonly string[];
    resolveFfmpegLocation?: () => string | undefined;
    killGraceMs?: number;
    clock?: () => number;
}
/** Normalize the VSCO profile gallery aliases supported by gallery-dl. */
export declare const normalizeVscoGalleryUrl: (value: string) => NormalizedVscoGalleryUrl | null;
/** Keep photo galleries out of single-media and transcription flows. */
export declare const resolveDownloadTaskKind: (url: string, requestedType: 'audio' | 'video') => TaskKind;
export declare const resolveDefaultGalleryDlFilenameTemplate: (url: string) => string;
export declare const resolveGalleryDlFilenameTemplate: (url: string, options: GalleryDlTaskOptions) => string;
/** Honor bounded waits announced by gallery-dl without hiding real stalls. */
export declare const galleryWaitDurationMs: (line: string) => number | undefined;
export declare class GalleryDlExecutor implements Executor {
    private readonly options;
    constructor(options: GalleryDlExecutorOptions);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
}
export declare const shouldUseGalleryDl: (url: string) => boolean;
export declare class HostRoutingExecutor implements Executor {
    private readonly ytDlp;
    private readonly galleryDl;
    constructor(ytDlp: Executor, galleryDl: Executor);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
}
export {};
