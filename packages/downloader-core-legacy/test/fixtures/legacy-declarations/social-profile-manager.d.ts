import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission';
import type { GalleryDlExecutorOptions } from './gallery-dl-executor';
import { type SocialMappedProfile } from './social-media-service';
import type { DownloadRuntimeSettings } from './types';
export interface SocialProfileManagerOptions {
    storageDir: string;
    runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & {
        admission?: SourceAdmission;
    };
    resolveYtDlpPath: () => string;
}
export declare class SocialProfileManager {
    private readonly active;
    private readonly options;
    constructor(options: SocialProfileManagerOptions);
    private directory;
    private filename;
    private save;
    get(url: string): SocialMappedProfile;
    list(): SocialMappedProfile[];
    stop(url: string): Promise<SocialMappedProfile>;
    /** Each platform's traversal; all of them stream post references only. */
    private startMapping;
    /**
     * Map a category and resolve once the traversal settles. `incremental` stops
     * X, TikTok and Threads after a run of already-saved posts; subscription
     * checks use it so each check reads only the newest part of a timeline.
     */
    mapAndWait(url: string, category: string, settings?: DownloadRuntimeSettings, options?: {
        incremental?: boolean;
        signal?: AbortSignal;
    }): Promise<SocialMappedProfile>;
    map(url: string, category: string, settings?: DownloadRuntimeSettings, options?: {
        incremental?: boolean;
    }): SocialMappedProfile;
}
