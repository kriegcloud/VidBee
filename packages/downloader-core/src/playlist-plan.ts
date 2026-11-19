import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { DownloadQueue } from "./DownloadQueue.service.js";
import type { PlaylistEntry, PlaylistInfo, PlaylistMediaKind } from "./types.js";

export type { PlaylistMediaKind };

export const BROWSER_CAPTURE_GROUP_KEY = "browser-capture";
export const BROWSER_CAPTURE_MAX_PER_GROUP = 2;

const MEDIA_KIND_RANK: Record<PlaylistMediaKind, number> = {
  recording: 0,
  video: 1,
  photo: 2,
};

const PlaylistEntryFields = S.Struct({
  id: S.optional(S.Unknown),
  ie_key: S.optional(S.Unknown),
  media_type: S.optional(S.Unknown),
  original_url: S.optional(S.Unknown),
  thumbnail: S.optional(S.Unknown),
  title: S.optional(S.Unknown),
  url: S.optional(S.Unknown),
  webpage_url: S.optional(S.Unknown),
});
export type RawPlaylistEntry = typeof PlaylistEntryFields.Type;

const isHttpUrl = (value: unknown): boolean => {
  if (!(value !== undefined && value !== null && value !== "")) {
    return false;
  }
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = Str.trim(value);
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Parse a yt-dlp `media_type` (or close aliases) into a playlist media kind. */
export const parsePlaylistMediaKind = (value: unknown): PlaylistMediaKind | undefined => {
  if (value === "photo" || value === "video" || value === "recording") {
    return value;
  }
  if (value === "drm" || value === "image") {
    return value === "image" ? "photo" : "recording";
  }
  return undefined;
};

export const resolvePlaylistEntryUrl = (entry: RawPlaylistEntry): string | undefined => {
  if (isHttpUrl(entry.url)) {
    return optionalString(entry.url);
  }
  if (isHttpUrl(entry.webpage_url)) {
    return optionalString(entry.webpage_url);
  }
  if (isHttpUrl(entry.original_url)) {
    return optionalString(entry.original_url);
  }
  const hasUrl = Boolean(entry.url);
  if (hasUrl) {
    if (typeof entry.url !== "string") throw new TypeError("entry.url.trim is not a function");
    const extractedId = Str.trim(entry.url);
    if (entry.ie_key != null && typeof entry.ie_key !== "string")
      throw new TypeError("entry.ie_key?.toLowerCase is not a function");
    const extractor = entry.ie_key == null ? "" : Str.toLowerCase(entry.ie_key);
    if (Str.includes("youtube")(extractor)) {
      return `https://www.youtube.com/watch?v=${extractedId}`;
    }
    if (Str.includes("youtubemusic")(extractor)) {
      return `https://music.youtube.com/watch?v=${extractedId}`;
    }
  }
  return undefined;
};

export const mapPlaylistInfo: {
  (fallbackId: string): (raw: { id?: unknown; title?: unknown; entries?: unknown }) => PlaylistInfo;
  (raw: { id?: unknown; title?: unknown; entries?: unknown }, fallbackId: string): PlaylistInfo;
} = dual(2, (raw: { id?: unknown; title?: unknown; entries?: unknown }, fallbackId: string): PlaylistInfo => {
  const rawEntries = A.isArray(raw.entries) ? raw.entries : [];
  const entries = A.filter(
    A.map(rawEntries, (item, index): PlaylistEntry | null => {
      const entry: RawPlaylistEntry = Option.getOrElse(S.decodeUnknownOption(PlaylistEntryFields)(item), () => ({}));
      const resolvedUrl = resolvePlaylistEntryUrl(entry);
      if (resolvedUrl === undefined || resolvedUrl === "") {
        return null;
      }
      const mapped: PlaylistEntry = {
        id: optionalString(entry.id) ?? `${index + 1}`,
        title: optionalString(entry.title) ?? `Entry ${index + 1}`,
        url: resolvedUrl,
        index: index + 1,
      };
      const thumbnail = optionalString(entry.thumbnail);
      if (thumbnail !== undefined && thumbnail !== "") {
        mapped.thumbnail = thumbnail;
      }
      const mediaKind = parsePlaylistMediaKind(entry.media_type);
      if (mediaKind !== undefined) {
        mapped.mediaKind = mediaKind;
      }
      return mapped;
    }),
    (entry): entry is PlaylistEntry => entry !== null
  );
  return {
    id: optionalString(raw.id) ?? fallbackId,
    title: optionalString(raw.title) ?? "Playlist",
    entries,
    entryCount: entries.length,
  };
});

const kindRank = (kind: PlaylistMediaKind | undefined): number => {
  const hasKind = Boolean(kind);
  return kind === undefined || kind === null || !hasKind ? MEDIA_KIND_RANK.photo + 1 : MEDIA_KIND_RANK[kind];
};

/**
 * DRM recordings first (they take longest), then direct videos, then photos.
 * Stable by original index within a kind so the inventory order is preserved.
 */
export const planPlaylistDownloadOrder = <T extends PlaylistEntry>(entries: readonly T[]): T[] =>
  [...entries].sort((left, right) => {
    const rankDelta = kindRank(left.mediaKind) - kindRank(right.mediaKind);
    return rankDelta !== 0 ? rankDelta : left.index - right.index;
  });

/** Recordings share a global capture cap; other items stay on the playlist group. */
export const playlistEntryGroupKey: {
  (playlistGroupKey: string): (entry: Pick<PlaylistEntry, "mediaKind">) => string;
  (entry: Pick<PlaylistEntry, "mediaKind">, playlistGroupKey: string): string;
} = dual(2, (entry: Pick<PlaylistEntry, "mediaKind">, playlistGroupKey: string): string =>
  entry.mediaKind === "recording" ? BROWSER_CAPTURE_GROUP_KEY : playlistGroupKey
);

export const restoreBrowserCaptureGroupCap = Effect.fn("Playlist.restoreBrowserCaptureGroupCap")(function* () {
  const queue = yield* DownloadQueue;
  yield* queue.setMaxPerGroup(BROWSER_CAPTURE_GROUP_KEY, BROWSER_CAPTURE_MAX_PER_GROUP);
});
