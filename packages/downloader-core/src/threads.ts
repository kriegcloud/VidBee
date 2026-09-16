const THREADS_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'])
const THREADS_PATH =
  /^\/@([A-Za-z0-9_][A-Za-z0-9._]{0,29})(?:\/(media)|\/post\/([A-Za-z0-9_-]{5,20}))?\/?$/

export interface NormalizedThreadsUrl {
  kind: 'post' | 'profile'
  url: string
  username: string
  shortcode?: string
  directorySegments: readonly string[]
}

/** Threads profiles download their Media tab; replies and reposts are excluded. */
export const normalizeThreadsUrl = (value: string): NormalizedThreadsUrl | null => {
  try {
    const parsed = new URL(value)
    if (
      !(['http:', 'https:'].includes(parsed.protocol) && THREADS_HOSTS.has(parsed.hostname)) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null
    }
    const match = THREADS_PATH.exec(parsed.pathname)
    if (!match) {
      return null
    }
    const username = match[1].toLowerCase()
    const shortcode = match[3]
    return {
      kind: shortcode ? 'post' : 'profile',
      url: `https://www.threads.com/@${username}${shortcode ? `/post/${shortcode}` : '/media'}`,
      username,
      shortcode,
      directorySegments: shortcode ? ['Threads', username, shortcode] : ['Threads', username]
    }
  } catch {
    return null
  }
}
