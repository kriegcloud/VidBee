import { normalizeFacebookGalleryUrl } from '@vidbee/downloader-core/facebook-gallery'
import { normalizeThreadsUrl } from '@vidbee/downloader-core/threads'
import { normalizeTikTokPhotoUrl } from '@vidbee/downloader-core/tiktok-photo'

export const isFacebookGalleryUrl = (value: string): boolean =>
  normalizeFacebookGalleryUrl(value) !== null

/** TikTok photo-mode posts download as an image set; video posts stay on yt-dlp. */
export const isTikTokPhotoUrl = (value: string): boolean => normalizeTikTokPhotoUrl(value) !== null

export const isThreadsUrl = (value: string): boolean => normalizeThreadsUrl(value) !== null

const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'm.youtube.com'] as const
// YouTube channel/handle landing pages (e.g. /@handle/videos, /channel/UC…,
// /user/…, /c/…) list many videos; route them through the playlist flow so a
// single unavailable entry can't abort the whole fetch (GitHub issue #322).
const YOUTUBE_CHANNEL_PATH = /^\/(@[^/]+|channel\/|user\/|c\/)/i
const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am'
])
const INSTAGRAM_PROFILE_NAME = /^[A-Za-z0-9._]{1,30}$/
const INSTAGRAM_RESERVED_PATHS = new Set([
  'accounts',
  'about',
  'developer',
  'direct',
  'directory',
  'emails',
  'explore',
  'legal',
  'p',
  'press',
  'privacy',
  'reel',
  'reels',
  'share',
  'stories',
  'tv',
  'web'
])
const VSCO_HOSTS = new Set(['vsco.co', 'www.vsco.co'])
const VSCO_GALLERY_PATH = /^\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/(?:gallery|images))?\/?$/i
const FACEBOOK_REELS_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
  'web.facebook.com'
])
const FACEBOOK_REELS_PATH =
  /^\/(?!groups\/|pages\/|share\/|reel\/|watch\/)[A-Za-z0-9][A-Za-z0-9.]*\/reels\/?$/

/** Profile reels are a video playlist; /reel/ID remains an individual video. */
export const isFacebookReelsUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      FACEBOOK_REELS_HOSTS.has(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      FACEBOOK_REELS_PATH.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

/**
 * Check whether a URL points to an Instagram profile root.
 *
 * Individual posts, reels, stories, and profile sub-pages intentionally return
 * false so they continue through the normal single-item workflow.
 */
export const isInstagramProfileUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false
    }
    if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
      return false
    }
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length !== 1) {
      return false
    }
    const username = segments[0]
    return (
      Boolean(username) &&
      INSTAGRAM_PROFILE_NAME.test(username) &&
      !INSTAGRAM_RESERVED_PATHS.has(username.toLowerCase())
    )
  } catch {
    return false
  }
}

/** Check whether a URL points to a complete VSCO profile gallery. */
export const isVscoGalleryUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      VSCO_HOSTS.has(parsed.hostname.toLowerCase()) &&
      VSCO_GALLERY_PATH.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

const ONLYFANS_HOSTS = new Set(['onlyfans.com', 'www.onlyfans.com'])
const ONLYFANS_POST_PATH = /^\/\d+\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/
const ONLYFANS_CHAT_LIST_PATH =
  /^\/my\/chats\/chat\/\d+(?:\/gallery(?:\/(?:opened|purchased|photos|videos))?)?\/?$/i
const ONLYFANS_PROFILE_TAB = /^(media|photos|videos)$/i
const ONLYFANS_RESERVED_PROFILES = new Set([
  'api',
  'api2',
  'chats',
  'collections',
  'credits',
  'help',
  'login',
  'messages',
  'my',
  'notifications',
  'posts',
  'privacy',
  'search',
  'settings',
  'signup',
  'subscriptions',
  'tagged',
  'terms',
  'users',
  'vault'
])

const isOnlyFansHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    if (!ONLYFANS_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * OnlyFans posts are galleries: a single post URL can carry several photos
 * and videos, so route them through the playlist flow to download them all.
 */
export const isOnlyFansPostUrl = (value: string): boolean => {
  const parsed = isOnlyFansHttpUrl(value)
  return Boolean(parsed && ONLYFANS_POST_PATH.test(parsed.pathname))
}

/** Profile root and /media /photos /videos tabs list many galleries. */
export const isOnlyFansProfileUrl = (value: string): boolean => {
  const parsed = isOnlyFansHttpUrl(value)
  if (!parsed) {
    return false
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 1 || segments.length > 2) {
    return false
  }
  const username = segments[0]
  if (!username || ONLYFANS_RESERVED_PROFILES.has(username.toLowerCase())) {
    return false
  }
  return segments.length === 1 || ONLYFANS_PROFILE_TAB.test(segments[1] ?? '')
}

/** Chat threads and chat galleries inventory media by paging the message list. */
export const isOnlyFansChatListUrl = (value: string): boolean => {
  const parsed = isOnlyFansHttpUrl(value)
  return Boolean(parsed && ONLYFANS_CHAT_LIST_PATH.test(parsed.pathname))
}

/** Profile feeds and chat threads collect many media items before download. */
export const isOnlyFansListUrl = (value: string): boolean =>
  isOnlyFansProfileUrl(value) || isOnlyFansChatListUrl(value)

/**
 * Check whether a URL should be handled as a playlist-style resource.
 *
 * Issue ref: #316, #322.
 */
export const isPlaylistLikeUrl = (value: string): boolean => {
  if (isFacebookReelsUrl(value)) {
    return true
  }
  if (isOnlyFansPostUrl(value) || isOnlyFansListUrl(value)) {
    return true
  }
  try {
    const parsed = new URL(value)
    const playlistQueryKeys = ['collection', 'list', 'playlist', 'set']
    if (
      playlistQueryKeys.some((key) => {
        return Boolean(parsed.searchParams.get(key)?.trim())
      })
    ) {
      return true
    }

    const host = parsed.hostname.toLowerCase()
    const isYouTubeHost = YOUTUBE_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    )
    if (isYouTubeHost && YOUTUBE_CHANNEL_PATH.test(parsed.pathname)) {
      return true
    }

    const pathname = parsed.pathname.toLowerCase()
    return ['/playlist', '/playlists/', '/collection/', '/collections/', '/sets/'].some((token) =>
      pathname.includes(token)
    )
  } catch {
    return false
  }
}
