import { describe, expect, it } from 'vitest'
import { resolveDownloadTaskKind, shouldUseGalleryDl } from '../src/gallery-dl-executor'
import {
  resolveSocialSource,
  SocialMediaOptionsSchema,
  socialCollectionUrl
} from '../src/social-media'

describe('social collection routing', () => {
  it.each([
    [
      'https://twitter.com/fixture/status/123/photo/2?s=20',
      'x',
      'post',
      'https://x.com/i/web/status/123'
    ],
    [
      'https://old.reddit.com/r/pics/comments/abc123/title/?utm_source=share',
      'reddit',
      'post',
      'https://www.reddit.com/comments/abc123'
    ],
    ['https://redd.it/abc123', 'reddit', 'post', 'https://www.reddit.com/comments/abc123'],
    [
      'https://preview.redd.it/photo.jpg?width=640',
      'reddit',
      'image',
      'https://i.redd.it/photo.jpg'
    ],
    [
      'https://www.tiktok.com/@fixture/photo/123?lang=en',
      'tiktok',
      'post',
      'https://www.tiktok.com/@fixture/photo/123'
    ],
    [
      'https://tiktok.com/@fixture/liked',
      'tiktok',
      'feed',
      'https://www.tiktok.com/@fixture/likes'
    ],
    [
      'https://www.instagram.com/fixture/p/DYlQVsCDFmP/?img_index=18',
      'instagram',
      'post',
      'https://www.instagram.com/p/DYlQVsCDFmP/'
    ],
    [
      'https://instagram.com/p/DYlQVsCDFmP',
      'instagram',
      'post',
      'https://www.instagram.com/p/DYlQVsCDFmP/'
    ]
  ])('normalizes %s', (url, platform, kind, canonical) => {
    expect(resolveSocialSource(url)).toMatchObject({ platform, kind, url: canonical })
    expect(resolveDownloadTaskKind(url, 'video')).toBe('social-media')
    expect(shouldUseGalleryDl(url)).toBe(true)
  })
  it.each([
    'https://x.com/fixture/media',
    'https://x.com/fixture/timeline',
    'https://x.com/home/following',
    'https://x.com/search?q=photos&f=live',
    'https://x.com/i/bookmarks',
    'https://x.com/i/lists/123/members',
    'https://x.com/i/communities/123',
    'https://www.reddit.com/r/pics/top?t=all',
    'https://www.reddit.com/user/fixture/saved',
    'https://www.tiktok.com/@fixture/posts',
    'https://www.tiktok.com/@fixture/reposts',
    'https://www.tiktok.com/following'
  ])('accepts explicit collection %s', (url) => {
    expect(resolveSocialSource(url)?.kind).toBe('feed')
  })
  it.each([
    ['https://x.com/fixture', 'https://x.com/fixture/tweets'],
    ['https://reddit.com/u/fixture', 'https://www.reddit.com/user/fixture/submitted'],
    ['https://tiktok.com/@fixture', 'https://www.tiktok.com/@fixture/posts']
  ])('defaults %s to posts', (url, canonical) => {
    const source = resolveSocialSource(url)
    expect(source?.kind).toBe('profile')
    expect(source && socialCollectionUrl(source)).toBe(canonical)
  })
  it.each([
    'https://x.com/i/web/foo/123',
    'https://x.com/i/bookmarks/123',
    'https://tiktok.com/foryou',
    'https://tiktok.com/@fixture/photo/nope'
  ])('rejects unsupported surface %s without video fallback', (url) => {
    expect(resolveSocialSource(url)?.kind).toBe('unsupported')
    expect(resolveDownloadTaskKind(url, 'video')).toBe('social-media')
  })
  it.each([
    'https://www.instagram.com/reel/DYlQVsCDFmP/',
    'https://www.instagram.com/fixture/',
    'https://www.instagram.com/fixture/tagged/',
    'https://www.instagram.com/p/DYlQVsCDFmP/c/123/'
  ])('leaves Instagram reel and profile URL %s to their own flows', (url) => {
    expect(resolveSocialSource(url)).toBeNull()
  })
  it.each([
    'https://x.com.evil.test/u/status/123',
    'https://user:pass@x.com/u/status/123',
    'https://reddit.com:8443/r/pics',
    'file:///x.com/u/status/123'
  ])('rejects unrelated or credential-bearing URL %s', (url) => {
    expect(resolveSocialSource(url)).toBeNull()
  })
  it('requests the original X CDN rendition', () => {
    expect(resolveSocialSource('https://pbs.twimg.com/media/ABC?format=jpg&name=small')?.url).toBe(
      'https://pbs.twimg.com/media/ABC?format=jpg&name=orig'
    )
  })
  it('validates limits and keeps full collections as the default', () => {
    expect(SocialMediaOptionsSchema.parse({})).toMatchObject({ media: 'all', linkedMedia: true })
    expect(SocialMediaOptionsSchema.parse({}).maxPosts).toBeUndefined()
    expect(SocialMediaOptionsSchema.safeParse({ maxPosts: 0 }).success).toBe(false)
    expect(
      SocialMediaOptionsSchema.safeParse({ since: '2026-09-16', until: '2026-09-15' }).success
    ).toBe(false)
  })
})
