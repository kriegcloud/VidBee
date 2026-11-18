export type TikTokShortLinkFetch = (input: string, init: RequestInit) => Promise<Response>;
export interface ExpandTikTokShortLinkOptions {
    fetch?: TikTokShortLinkFetch;
    timeoutMs?: number;
}
/** Recognize share-sheet links: `vm.tiktok.com/CODE`, `vt.tiktok.com/CODE`, `tiktok.com/t/CODE`. */
export declare const isTikTokShortLink: (value: string) => boolean;
/**
 * Follow one TikTok short-link redirect to its canonical post URL.
 *
 * Non-short links come back unchanged. Short links that cannot be resolved
 * also come back unchanged so the caller can surface the engine error rather
 * than a resolver error.
 */
export declare const expandTikTokShortLink: (value: string, options?: ExpandTikTokShortLinkOptions) => Promise<string>;
