import { type TaskPriority, type TaskQueueAPI } from '@vidbee/task-queue-legacy';
import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission';
import { INSTAGRAM_PROFILE_CATEGORIES, normalizeInstagramProfileUrl } from './instagram-url';
import type { DownloadRuntimeSettings, InstagramProfileCategory, InstagramProfileDownloadInput, InstagramProfileDownloadResult, InstagramProfileInspection } from './types';
export { INSTAGRAM_PROFILE_CATEGORIES, normalizeInstagramProfileUrl };
export declare const INSTAGRAM_RATE_LIMIT_COOLDOWN_MS: number;
export declare const INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS: readonly ['-o', 'extractor.instagram.api=rest', '-o', 'extractor.instagram.videos=true', '-o', 'extractor.instagram.static-videos=true', '-o', 'extractor.instagram.previews=false', '-o', 'extractor.instagram.audio=false'];
interface InspectionCacheEntry {
    inspection: InstagramProfileInspection;
    categoryUrls: Record<InstagramProfileCategory, string>;
}
export interface InstagramProfileInspectorOptions {
    admission?: SourceAdmission;
    completedDownloads?: () => {
        url: string;
        category: string;
        assetCount: number;
    }[];
    storageDir?: string;
    resolveBinaryPath: () => string;
    resolveExtraArgs?: (settings?: DownloadRuntimeSettings) => readonly string[];
    clock?: () => number;
    maxCacheEntries?: number;
}
export interface EnqueueInstagramProfileOptions {
    queue: TaskQueueAPI;
    inspector: InstagramProfileInspector;
    input: InstagramProfileDownloadInput;
    defaultDownloadDir: string;
    /** Join an existing queue batch (one subscription check) instead of a new one. */
    batch?: {
        id: string;
        title: string;
    };
    /** Defaults to `PRIORITY_USER`. */
    priority?: TaskPriority;
}
/** Saved inspections are keyed by username, so callers can address one without scanning. */
export declare const instagramInspectionId: (username: string) => string;
export declare const buildInstagramCategoryUrl: (username: string, category: InstagramProfileCategory) => string;
export declare const buildGalleryDlRuntimeArgs: (settings?: DownloadRuntimeSettings) => readonly string[];
export declare class InstagramProfileInspector {
    private readonly mapping;
    private readonly controllers;
    private readonly pending;
    private inspectionTail;
    private readonly cache;
    private readonly clock;
    private readonly maxCacheEntries;
    private readonly options;
    private rateLimitedUntil;
    constructor(options: InstagramProfileInspectorOptions);
    list(): Pick<InstagramProfileInspection, 'inspectionId' | 'profile' | 'totalSourceCount' | 'totalAssetCount' | 'mapping'>[];
    private withMapping;
    stop(): Promise<void>;
    cancel(url: string): boolean;
    inspect(url: string, settings?: DownloadRuntimeSettings, requestedCategories?: readonly InstagramProfileCategory[]): Promise<InstagramProfileInspection>;
    private scan;
    private save;
    get(inspectionId: string): InspectionCacheEntry | null;
    private pruneExpired;
}
export declare const enqueueInstagramProfileDownload: ({ queue, inspector, input, defaultDownloadDir, batch, priority }: EnqueueInstagramProfileOptions) => Promise<InstagramProfileDownloadResult>;
export declare const restoreInstagramProfileGroupCaps: (queue: TaskQueueAPI) => Promise<void>;
