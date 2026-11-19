// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
import type { OnlyFansItem } from '@vidbee/downloader-core/onlyfans-profile';
import { type BrowserProfileAdapter, OnlyFansProfiles } from './onlyfans-profile';
/** Only first-party media locations are accepted; account credentials never go to the CDN. */
export declare function fanslyMediaUrl(value: unknown): string | null;
/** Preserve attachment identity and never substitute a locked item's preview. */
export declare function fanslyItems(payload: unknown): {
    item: OnlyFansItem;
    mediaUrl: string | null;
}[];
export declare const fanslyAdapter: BrowserProfileAdapter;
export declare class FanslyProfiles extends OnlyFansProfiles {
    constructor(storageDir: string, defaultDownloadDir: () => string);
}
