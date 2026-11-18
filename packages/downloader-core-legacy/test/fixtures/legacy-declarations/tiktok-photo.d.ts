export interface NormalizedTikTokPhotoUrl {
    /** Canonical post URL handed to gallery-dl. */
    url: string;
    /** Handle without the leading `@`; empty for `/share/photo/ID` links. */
    username: string;
    postId: string;
    directorySegments: readonly string[];
}
/**
 * Recognize TikTok photo-mode posts (`/@user/photo/ID`, `/share/photo/ID`).
 *
 * Video posts, profiles, and short links intentionally return null so they
 * keep flowing through yt-dlp, which cannot extract photo posts at all.
 */
export declare const normalizeTikTokPhotoUrl: (value: string) => NormalizedTikTokPhotoUrl | null;
