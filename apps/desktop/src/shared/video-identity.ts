import * as A from 'effect/Array'
import { pipe } from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as O from 'effect/Option'
import * as Str from 'effect/String'

const YOUTUBE_HOSTS = HashSet.fromIterable([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
])
const BILIBILI_HOSTS = HashSet.fromIterable(['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'])
const YOUTUBE_ID = /^[\w-]{11}$/
const BILIBILI_ID = /^BV[\dA-Za-z]{10}$/

/**
 * Normalize a public video URL to the same identity Desktop and the extension use.
 *
 * @param input Watch, Shorts, Live, share, or Bilibili page URL.
 *
 * **Example** (Access the videoIdentityFromUrl contract)
 *
 * ```ts
 * import { videoIdentityFromUrl } from './video-identity.js'
 * void videoIdentityFromUrl
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function videoIdentityFromUrl(input: string): string | null {
  try {
    const url = new URL(Str.trim(input))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null
    }
    const host = Str.toLowerCase(url.hostname)
    if (HashSet.has(YOUTUBE_HOSTS, host)) {
      const id =
        host === 'youtu.be'
          ? pipe(url.pathname, Str.split('/'), A.findFirst(Boolean), O.getOrUndefined)
          : url.pathname === '/watch'
            ? url.searchParams.get('v')
            : pipe(
                url.pathname,
                Str.match(/^\/(?:shorts|live|embed)\/([^/]+)/),
                O.getOrUndefined
              )?.[1]
      return id !== null && id !== undefined && YOUTUBE_ID.test(id) ? `youtube:${id}` : null
    }
    if (HashSet.has(BILIBILI_HOSTS, host)) {
      const id =
        pipe(
          url.pathname,
          Str.match(/\/video\/(BV[\dA-Za-z]{10})(?:\/|$)/),
          O.getOrUndefined
        )?.[1] ?? (Str.startsWith('/list/')(url.pathname) ? url.searchParams.get('bvid') : null)
      if (id === null || id === undefined || !BILIBILI_ID.test(id)) {
        return null
      }
      const requestedPage = Number(url.searchParams.get('p') || 1)
      const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
      return `bilibili:${id}:${page}`
    }
    return null
  } catch {
    return null
  }
}
