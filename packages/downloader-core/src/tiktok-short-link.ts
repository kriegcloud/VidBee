const SHORT_LINK_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com'])
const CANONICAL_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])
const SHORT_CODE = /^\w{4,32}$/
const POST_PATH = /^\/(@[\w.-]{0,64}|share)\/(photo|video)\/(\d{6,32})\/?$/
const REDIRECT_STATUS_MIN = 300
const REDIRECT_STATUS_MAX = 399
const DEFAULT_TIMEOUT_MS = 10_000
/** TikTok only answers short links with a real 302 for link-preview crawlers. */
const SHORT_LINK_USER_AGENT = 'facebookexternalhit/1.1'

export type TikTokShortLinkFetch = (input: string, init: RequestInit) => Promise<Response>

export interface ExpandTikTokShortLinkOptions {
  fetch?: TikTokShortLinkFetch
  timeoutMs?: number
}

const parseHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null
  } catch {
    return null
  }
}

/** Recognize share-sheet links: `vm.tiktok.com/CODE`, `vt.tiktok.com/CODE`, `tiktok.com/t/CODE`. */
export const isTikTokShortLink = (value: string): boolean => {
  const parsed = parseHttpUrl(value.trim())
  if (!parsed) {
    return false
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  const host = parsed.hostname.toLowerCase()
  if (SHORT_LINK_HOSTS.has(host)) {
    return segments.length === 1 && SHORT_CODE.test(segments[0])
  }
  return (
    CANONICAL_HOSTS.has(host) &&
    segments.length === 2 &&
    segments[0] === 't' &&
    SHORT_CODE.test(segments[1])
  )
}

/**
 * Accept only redirect targets that name a concrete post; TikTok sends dead or
 * region-blocked codes to `https://www.tiktok.com/?_r=1`.
 */
const toCanonicalPostUrl = (location: string, base: string): string | null => {
  try {
    const target = new URL(location, base)
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      return null
    }
    const match = CANONICAL_HOSTS.has(target.hostname.toLowerCase())
      ? POST_PATH.exec(target.pathname)
      : null
    if (!match) {
      return null
    }
    const [, owner, mediaType, postId] = match
    if (owner !== '@') {
      return `https://www.tiktok.com/${owner}/${mediaType}/${postId}`
    }
    // Share fallbacks drop the handle (`/@/photo/ID`); only photo posts have a
    // handle-less canonical form that gallery-dl accepts.
    return mediaType === 'photo' ? `https://www.tiktok.com/share/photo/${postId}` : null
  } catch {
    return null
  }
}

/**
 * Follow one TikTok short-link redirect to its canonical post URL.
 *
 * Non-short links come back unchanged. Short links that cannot be resolved
 * also come back unchanged so the caller can surface the engine error rather
 * than a resolver error.
 */
export const expandTikTokShortLink = async (
  value: string,
  options: ExpandTikTokShortLinkOptions = {}
): Promise<string> => {
  const url = value.trim()
  if (!isTikTokShortLink(url)) {
    return value
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': SHORT_LINK_USER_AGENT },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    })
    const location = response.headers.get('location')
    const isRedirect =
      response.status >= REDIRECT_STATUS_MIN && response.status <= REDIRECT_STATUS_MAX
    if (!(isRedirect && location)) {
      return value
    }
    return toCanonicalPostUrl(location, url) ?? value
  } catch {
    return value
  }
}
