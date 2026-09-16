import { describe, expect, it } from 'vitest'
import { resolveDownloadTaskKind } from '../src/gallery-dl-executor'
import {
  expandTikTokShortLink,
  isTikTokShortLink,
  type TikTokShortLinkFetch
} from '../src/tiktok-short-link'

const PHOTO_URL = 'https://www.tiktok.com/@chillezy/photo/7240568259186019630'

const redirectTo =
  (location: string | null, status = 302) =>
  (calls: Array<{ url: string; init: RequestInit }>): TikTokShortLinkFetch =>
  (url, init) => {
    calls.push({ url, init })
    const headers = new Headers()
    if (location) {
      headers.set('location', location)
    }
    return Promise.resolve(new Response(null, { status, headers }))
  }

describe('isTikTokShortLink', () => {
  it.each([
    'https://vm.tiktok.com/ZTR45GpSF/',
    'https://vt.tiktok.com/ZSe4FqkKd',
    'https://www.tiktok.com/t/ZTRC5xgJp',
    'https://tiktok.com/t/ZTRC5xgJp/',
    '  https://vm.tiktok.com/ZTR45GpSF  '
  ])('accepts %s', (url) => {
    expect(isTikTokShortLink(url)).toBe(true)
  })

  it.each([
    PHOTO_URL,
    'https://www.tiktok.com/@chillezy/video/7240568259186019630',
    'https://www.tiktok.com/@chillezy',
    'https://vm.tiktok.com/',
    'https://vm.tiktok.com/ZTR45GpSF/extra',
    'https://vm.tiktok.com.evil.test/ZTR45GpSF',
    'ftp://vm.tiktok.com/ZTR45GpSF',
    'not a url'
  ])('rejects %s', (url) => {
    expect(isTikTokShortLink(url)).toBe(false)
  })
})

describe('expandTikTokShortLink', () => {
  it('follows one redirect with the crawler user agent and strips tracking query', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const expanded = await expandTikTokShortLink('https://vm.tiktok.com/ZTR45GpSF/', {
      fetch: redirectTo(`${PHOTO_URL}?_r=1&_t=abc`)(calls)
    })
    expect(expanded).toBe(PHOTO_URL)
    expect(resolveDownloadTaskKind(expanded, 'video')).toBe('tiktok-photo')
    expect(calls).toHaveLength(1)
    expect(calls[0].init).toMatchObject({ method: 'HEAD', redirect: 'manual' })
    expect(new Headers(calls[0].init.headers).get('user-agent')).toBe('facebookexternalhit/1.1')
  })

  it('canonicalizes video and share targets', async () => {
    const video = await expandTikTokShortLink('https://vt.tiktok.com/ZSe4FqkKd', {
      fetch: redirectTo('https://m.tiktok.com/@user.name/video/7106594312292453675/')([])
    })
    expect(video).toBe('https://www.tiktok.com/@user.name/video/7106594312292453675')
    expect(resolveDownloadTaskKind(video, 'video')).toBe('video')

    const share = await expandTikTokShortLink('https://www.tiktok.com/t/ZTRC5xgJp', {
      fetch: redirectTo('/share/photo/7240568259186019630')([])
    })
    expect(share).toBe('https://www.tiktok.com/share/photo/7240568259186019630')

    const handleless = await expandTikTokShortLink('https://vt.tiktok.com/ZS66qYm24', {
      fetch: redirectTo(
        'https://www.tiktok.com/@/photo/7449725569123634450?_r=1&share_item_id=7449725569123634450'
      )([])
    })
    expect(handleless).toBe('https://www.tiktok.com/share/photo/7449725569123634450')
    expect(resolveDownloadTaskKind(handleless, 'video')).toBe('tiktok-photo')
  })

  it.each([
    ['dead code (homepage)', redirectTo('https://www.tiktok.com/?_r=1')],
    ['handle-less video', redirectTo('https://www.tiktok.com/@/video/7449725569123634450')],
    ['non-TikTok host', redirectTo('https://evil.test/@x/photo/7240568259186019630')],
    ['missing location', redirectTo(null)],
    ['non-redirect status', redirectTo(PHOTO_URL, 200)]
  ])('returns the input unchanged for %s', async (_label, makeFetch) => {
    const url = 'https://vm.tiktok.com/ZTR45GpSF/'
    expect(await expandTikTokShortLink(url, { fetch: makeFetch([]) })).toBe(url)
  })

  it('returns the input unchanged when the request fails', async () => {
    const url = 'https://vm.tiktok.com/ZTR45GpSF/'
    const failing: TikTokShortLinkFetch = () => Promise.reject(new Error('offline'))
    expect(await expandTikTokShortLink(url, { fetch: failing })).toBe(url)
  })

  it('does not touch non-short links', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    expect(await expandTikTokShortLink(PHOTO_URL, { fetch: redirectTo(PHOTO_URL)(calls) })).toBe(
      PHOTO_URL
    )
    expect(calls).toHaveLength(0)
  })
})
