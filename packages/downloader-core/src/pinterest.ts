const ROOT = 'https://www.pinterest.com'
const PIN_PATH = /^\/pin\/(?:[A-Za-z0-9_-]+--)?(\d+)\/?$/
const PROFILE_PATH = /^\/([A-Za-z0-9_]{1,64})(?:\/_created)?\/?$/
const RESERVED = new Set([
  'about',
  'business',
  'explore',
  'ideas',
  'login',
  'logout',
  'pin',
  'search',
  'settings',
  'signup',
  'today'
])

export type PinterestSource =
  | { kind: 'pin'; id: string; url: string; directorySegments: readonly string[] }
  | { kind: 'profile'; username: string; url: string; directorySegments: readonly string[] }

/** Profile roots select created pins, never the unrelated board named `_created`. */
export const normalizePinterestUrl = (value: string): PinterestSource | null => {
  try {
    const parsed = new URL(value)
    if (
      !(
        ['http:', 'https:'].includes(parsed.protocol) &&
        ['pinterest.com', 'www.pinterest.com'].includes(parsed.hostname)
      ) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null
    }
    const pin = PIN_PATH.exec(parsed.pathname)
    if (pin) {
      return {
        kind: 'pin',
        id: pin[1],
        url: `${ROOT}/pin/${pin[1]}/`,
        directorySegments: ['Pinterest', 'Pins']
      }
    }
    const username = PROFILE_PATH.exec(parsed.pathname)?.[1]
    if (!username || RESERVED.has(username.toLowerCase())) {
      return null
    }
    return {
      kind: 'profile',
      username,
      url: `${ROOT}/${username}/_created/`,
      directorySegments: ['Pinterest', username, 'Created']
    }
  } catch {
    return null
  }
}

export const PINTEREST_EXTRACTOR_ARGS = [
  '-o',
  'extractor.pinterest.videos=true',
  '-o',
  'extractor.pinterest.stories=true'
] as const
