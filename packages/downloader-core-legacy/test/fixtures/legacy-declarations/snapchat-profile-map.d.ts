import { type GalleryDlProfileMapRuntime } from './gallery-dl-json-run';
import type { SocialMappedItem } from './social-media-service';
import { type SnapchatCategory } from './snapchat';
import type { DownloadRuntimeSettings } from './types';
/** gallery-dl serializes `date` as UTC `YYYY-MM-DD HH:MM:SS`. */
export declare const parseGalleryDlDate: (value: unknown) => number | undefined;
/**
 * Map one category of a public Snapchat profile. `stories` covers the current
 * 24h story and saved highlights, one item per snap; `spotlight` is one item
 * per post. Only the first page the public web exposes is reachable.
 */
export declare const mapSnapchatProfile: (owner: string, category: SnapchatCategory, runtime: GalleryDlProfileMapRuntime, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void) => Promise<{
    complete: boolean;
    error?: string;
}>;
