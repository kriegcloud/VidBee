const DZEN_HOSTS = new Set(['dzen.ru', 'www.dzen.ru', 'zen.yandex.ru'])
const DZEN_CHANNEL_ID = /^[a-f0-9]{24}$/i
const DZEN_CHANNEL_NAME = /^[a-z0-9_-]+$/i
const DZEN_RESERVED_PATHS = new Set([
  'id',
  'video',
  'media',
  'watch',
  'shorts',
  'articles',
  'news',
  'search',
  'subscriptions',
  'profile',
  'settings',
  'login',
  'logout',
  'help',
  'a',
  'b'
])

/** Normalize a Dzen channel root without claiming individual publications or site pages. */
export const normalizeDzenProfileUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (
      !(['http:', 'https:'].includes(url.protocol) && DZEN_HOSTS.has(url.hostname)) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null
    }
    const pathname = url.pathname.replace(/\/$/, '')
    const parts = pathname.slice(1).split('/')
    if (parts.length === 2 && parts[0] === 'id' && DZEN_CHANNEL_ID.test(parts[1])) {
      return `https://dzen.ru/id/${parts[1].toLowerCase()}`
    }
    if (
      parts.length === 1 &&
      DZEN_CHANNEL_NAME.test(parts[0]) &&
      !DZEN_RESERVED_PATHS.has(parts[0].toLowerCase())
    ) {
      return `https://dzen.ru/${parts[0].toLowerCase()}`
    }
    return null
  } catch {
    return null
  }
}
