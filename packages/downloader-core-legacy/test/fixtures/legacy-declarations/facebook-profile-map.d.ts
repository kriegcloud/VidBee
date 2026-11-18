import { type GalleryDlProfileMapRuntime } from './gallery-dl-json-run';
import type { SocialMappedItem } from './social-media-service';
import type { DownloadRuntimeSettings } from './types';
export type FacebookProfileMapRuntime = GalleryDlProfileMapRuntime;
export declare const mapFacebookProfile: (url: string, category: 'photos' | 'albums' | 'reels', owner: string, runtime: FacebookProfileMapRuntime, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void) => Promise<{
    complete: boolean;
    error?: string;
}>;
