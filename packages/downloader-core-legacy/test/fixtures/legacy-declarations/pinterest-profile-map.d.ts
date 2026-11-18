import { type GalleryDlProfileMapRuntime } from './gallery-dl-json-run';
import type { SocialMappedItem } from './social-media-service';
import type { DownloadRuntimeSettings } from './types';
/** Save stable pin references, aggregating carousel/story assets per pin. */
export declare const mapPinterestProfile: (url: string, owner: string, runtime: GalleryDlProfileMapRuntime, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void) => Promise<{
    complete: boolean;
    error?: string;
}>;
