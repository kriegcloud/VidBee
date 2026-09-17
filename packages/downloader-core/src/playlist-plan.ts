import type { PlaylistEntry, PlaylistInfo, PlaylistMediaKind } from './types'

export type { PlaylistMediaKind }

export const BROWSER_CAPTURE_GROUP_KEY = 'browser-capture'
export const BROWSER_CAPTURE_MAX_PER_GROUP = 2

const MEDIA_KIND_RANK: Record<PlaylistMediaKind, number> = {
  recording: 0,
  video: 1,
  photo: 2
}

export interface RawPlaylistEntry {
  id?: string | null
  title?: string | null
  url?: string | null
  webpage_url?: string | null
  original_url?: string | null
  ie_key?: string | null
  thumbnail?: string | null
  media_type?: string | null
}

const isHttpUrl = (value?: string | null): boolean => {
  if (!value) {
    return false
  }
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Parse a yt-dlp `media_type` (or close aliases) into a playlist media kind. */
export const parsePlaylistMediaKind = (value: unknown): PlaylistMediaKind | undefined => {
  if (value === 'photo' || value === 'video' || value === 'recording') {
    return value
  }
  if (value === 'drm' || value === 'image') {
    return value === 'image' ? 'photo' : 'recording'
  }
  return undefined
}

export const resolvePlaylistEntryUrl = (entry: RawPlaylistEntry): string | undefined => {
  if (isHttpUrl(entry.url)) {
    return optionalString(entry.url)
  }
  if (isHttpUrl(entry.webpage_url)) {
    return optionalString(entry.webpage_url)
  }
  if (isHttpUrl(entry.original_url)) {
    return optionalString(entry.original_url)
  }
  if (entry.url) {
    const extractedId = entry.url.trim()
    const extractor = entry.ie_key?.toLowerCase() ?? ''
    if (extractor.includes('youtube')) {
      return `https://www.youtube.com/watch?v=${extractedId}`
    }
    if (extractor.includes('youtubemusic')) {
      return `https://music.youtube.com/watch?v=${extractedId}`
    }
  }
  return undefined
}

export const mapPlaylistInfo = (
  raw: { id?: string | null; title?: string | null; entries?: unknown },
  fallbackId: string
): PlaylistInfo => {
  const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
  const entries = rawEntries
    .map((item, index): PlaylistEntry | null => {
      const entry = (item && typeof item === 'object' ? item : {}) as RawPlaylistEntry
      const resolvedUrl = resolvePlaylistEntryUrl(entry)
      if (!resolvedUrl) {
        return null
      }
      const mapped: PlaylistEntry = {
        id: optionalString(entry.id) ?? `${index + 1}`,
        title: optionalString(entry.title) ?? `Entry ${index + 1}`,
        url: resolvedUrl,
        index: index + 1
      }
      const thumbnail = optionalString(entry.thumbnail)
      if (thumbnail) {
        mapped.thumbnail = thumbnail
      }
      const mediaKind = parsePlaylistMediaKind(entry.media_type)
      if (mediaKind) {
        mapped.mediaKind = mediaKind
      }
      return mapped
    })
    .filter((entry): entry is PlaylistEntry => entry !== null)
  return {
    id: optionalString(raw.id) ?? fallbackId,
    title: optionalString(raw.title) ?? 'Playlist',
    entries,
    entryCount: entries.length
  }
}

const kindRank = (kind: PlaylistMediaKind | undefined): number =>
  kind ? MEDIA_KIND_RANK[kind] : MEDIA_KIND_RANK.photo + 1

/**
 * DRM recordings first (they take longest), then direct videos, then photos.
 * Stable by original index within a kind so the inventory order is preserved.
 */
export const planPlaylistDownloadOrder = <T extends PlaylistEntry>(entries: readonly T[]): T[] =>
  [...entries].sort((left, right) => {
    const rankDelta = kindRank(left.mediaKind) - kindRank(right.mediaKind)
    return rankDelta !== 0 ? rankDelta : left.index - right.index
  })

/** Recordings share a global capture cap; other items stay on the playlist group. */
export const playlistEntryGroupKey = (
  entry: Pick<PlaylistEntry, 'mediaKind'>,
  playlistGroupKey: string
): string => (entry.mediaKind === 'recording' ? BROWSER_CAPTURE_GROUP_KEY : playlistGroupKey)

export const restoreBrowserCaptureGroupCap = async (queue: {
  setMaxPerGroup: (groupKey: string, n: number | null) => Promise<void>
}): Promise<void> => {
  await queue.setMaxPerGroup(BROWSER_CAPTURE_GROUP_KEY, BROWSER_CAPTURE_MAX_PER_GROUP)
}
