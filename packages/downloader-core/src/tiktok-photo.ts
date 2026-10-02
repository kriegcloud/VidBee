const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])
const USERNAME = /^[\w.-]{1,64}$/
const POST_ID = /^\d{6,32}$/
const ROOT = 'https://www.tiktok.com'

export interface NormalizedTikTokPhotoUrl {
  /** Canonical post URL handed to gallery-dl. */
  url: string
  /** Handle without the leading `@`; empty for `/share/photo/ID` links. */
  username: string
  postId: string
  directorySegments: readonly string[]
}

/**
 * Recognize TikTok photo-mode posts (`/@user/photo/ID`, `/share/photo/ID`).
 *
 * Video posts, profiles, and short links intentionally return null so they
 * keep flowing through yt-dlp, which cannot extract photo posts at all.
 */
export const normalizeTikTokPhotoUrl = (value: string): NormalizedTikTokPhotoUrl | null => {
  try {
    const parsed = new URL(value)
    if (!(['http:', 'https:'].includes(parsed.protocol) && TIKTOK_HOSTS.has(parsed.hostname))) {
      return null
    }
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length !== 3 || segments[1] !== 'photo' || !POST_ID.test(segments[2])) {
      return null
    }
    const owner = segments[0]
    const postId = segments[2]
    if (owner === 'share') {
      return {
        url: `${ROOT}/share/photo/${postId}`,
        username: '',
        postId,
        directorySegments: ['TikTok', 'Photos']
      }
    }
    if (!owner.startsWith('@')) {
      return null
    }
    const username = owner.slice(1)
    if (!USERNAME.test(username)) {
      return null
    }
    return {
      url: `${ROOT}/@${username}/photo/${postId}`,
      username,
      postId,
      directorySegments: ['TikTok', username]
    }
  } catch {
    return null
  }
}
