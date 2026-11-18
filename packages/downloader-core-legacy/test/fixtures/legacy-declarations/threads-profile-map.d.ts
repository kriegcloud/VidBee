import { type GalleryDlProfileMapRuntime } from './gallery-dl-json-run';
import { type ProfileMapOptions, type SocialMappedItem } from './social-media-service';
import type { DownloadRuntimeSettings } from './types';
export declare const mapThreadsProfile: (url: string, owner: string, runtime: GalleryDlProfileMapRuntime, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void, options?: ProfileMapOptions) => Promise<{
    complete: boolean;
    error?: string;
}>;
