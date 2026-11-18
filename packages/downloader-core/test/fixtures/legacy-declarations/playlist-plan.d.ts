import type { PlaylistEntry, PlaylistInfo, PlaylistMediaKind } from './types';
export type { PlaylistMediaKind };
export declare const BROWSER_CAPTURE_GROUP_KEY = "browser-capture";
export declare const BROWSER_CAPTURE_MAX_PER_GROUP = 2;
export interface RawPlaylistEntry {
    id?: string | null;
    title?: string | null;
    url?: string | null;
    webpage_url?: string | null;
    original_url?: string | null;
    ie_key?: string | null;
    thumbnail?: string | null;
    media_type?: string | null;
}
/** Parse a yt-dlp `media_type` (or close aliases) into a playlist media kind. */
export declare const parsePlaylistMediaKind: (value: unknown) => PlaylistMediaKind | undefined;
export declare const resolvePlaylistEntryUrl: (entry: RawPlaylistEntry) => string | undefined;
export declare const mapPlaylistInfo: (raw: {
    id?: string | null;
    title?: string | null;
    entries?: unknown;
}, fallbackId: string) => PlaylistInfo;
/**
 * DRM recordings first (they take longest), then direct videos, then photos.
 * Stable by original index within a kind so the inventory order is preserved.
 */
export declare const planPlaylistDownloadOrder: <T extends PlaylistEntry>(entries: readonly T[]) => T[];
/** Recordings share a global capture cap; other items stay on the playlist group. */
export declare const playlistEntryGroupKey: (entry: Pick<PlaylistEntry, 'mediaKind'>, playlistGroupKey: string) => string;
export declare const restoreBrowserCaptureGroupCap: (queue: {
    setMaxPerGroup: (groupKey: string, n: number | null) => Promise<void>;
}) => Promise<void>;
