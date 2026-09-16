import { normalizeFacebookGalleryUrl } from '@vidbee/downloader-core/facebook-gallery'
import { normalizeTikTokPhotoUrl } from '@vidbee/downloader-core/tiktok-photo'

export const isFacebookGalleryUrl = (value: string): boolean =>
  normalizeFacebookGalleryUrl(value) !== null

/** TikTok photo-mode posts download as an image set; video posts stay on yt-dlp. */
export const isTikTokPhotoUrl = (value: string): boolean => normalizeTikTokPhotoUrl(value) !== null

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

/**
 * Check whether a URL should be handled as a playlist-style resource.
 *
 * Issue ref: #316, #322.
 */
export const isPlaylistLikeUrl = (value: string): boolean => {
  if (isFacebookReelsUrl(value)) {
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
