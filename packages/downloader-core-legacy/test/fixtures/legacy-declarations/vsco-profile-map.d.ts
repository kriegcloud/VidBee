import { type GalleryDlProfileMapRuntime } from './gallery-dl-json-run';
import type { SocialMappedItem } from './social-media-service';
import type { DownloadRuntimeSettings } from './types';
export interface VscoProfileMapResult {
    complete: boolean;
    error?: string;
    /** VSCO refused the request until the browser passes its Cloudflare check. */
    authRequired?: boolean;
}
export interface VscoProfileMapOptions {
    /** Overrides {@link COOKIE_REFRESH_DELAYS_MS}; tests pass short delays. */
    cookieRefreshDelaysMs?: readonly number[];
}
export declare const mapVscoProfile: (url: string, owner: string, runtime: GalleryDlProfileMapRuntime, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void, options?: VscoProfileMapOptions) => Promise<VscoProfileMapResult>;
