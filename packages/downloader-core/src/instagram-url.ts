import type { InstagramProfileCategory } from './types'

const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/
const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am'
])
const RESERVED_PROFILE_PATHS = new Set([
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

export const INSTAGRAM_PROFILE_CATEGORIES: readonly InstagramProfileCategory[] = [
  'highlights',
  'posts',
  'reels',
  'tagged',
  'stories'
]

/** Instagram account URL (any profile tab or story alias) → canonical profile. */
export const normalizeInstagramProfileUrl = (
  value: string
): { username: string; profileUrl: string } | null => {
  try {
    const parsed = new URL(value)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null
    }
    if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null
    }
    let segments = parsed.pathname.split('/').filter(Boolean)
    const [first, second] = segments
    if (segments.length === 2 && first === 'stories' && second && second !== 'highlights') {
      segments = [second]
    }
    if (
      segments.length === 2 &&
      first &&
      INSTAGRAM_PROFILE_CATEGORIES.includes(segments[1] as InstagramProfileCategory)
    ) {
      segments = [first]
    }
    const username = segments.length === 1 ? segments[0] : undefined
    if (
      !username ||
      RESERVED_PROFILE_PATHS.has(username.toLowerCase()) ||
      !INSTAGRAM_USERNAME_PATTERN.test(username)
    ) {
      return null
    }
    return {
      username: username.toLowerCase(),
      profileUrl: `https://www.instagram.com/${username.toLowerCase()}/`
    }
  } catch {
    return null
  }
}
