import path from 'node:path'

import { type TaskQueueAPI, TRANSCRIBABLE_TASK_KINDS } from '@vidbee/task-queue'
import { describe, expect, it, vi } from 'vitest'
import {
  galleryWaitDurationMs,
  normalizeVscoGalleryUrl,
  resolveDefaultGalleryDlFilenameTemplate,
  resolveDownloadTaskKind,
  resolveGalleryDlFilenameTemplate,
  shouldUseGalleryDl,
  VSCO_GALLERY_DL_EXTRACTOR_ARGS
} from '../src/gallery-dl-executor'
import {
  buildGalleryDlRuntimeArgs,
  buildInstagramCategoryUrl,
  enqueueInstagramProfileDownload,
  INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS,
  type InstagramProfileInspector,
  normalizeInstagramProfileUrl
} from '../src/instagram-profile'

describe('Instagram profile URL routing', () => {
  it('normalizes a profile root and strips query parameters', () => {
    expect(
      normalizeInstagramProfileUrl('https://www.instagram.com/vidbee.example/?utm_source=test')
    ).toEqual({
      username: 'vidbee.example',
      profileUrl: 'https://www.instagram.com/vidbee.example/'
    })
  })

  it.each([
    'https://www.instagram.com/p/abc/',
    'https://www.instagram.com/reel/abc/',
    'https://www.instagram.com/stories/vidbee/123/',
    'https://example.com/vidbee/'
  ])('does not classify an item URL as a profile: %s', (url) => {
    expect(normalizeInstagramProfileUrl(url)).toBeNull()
  })

  it('builds the dedicated gallery-dl category URLs', () => {
    expect(buildInstagramCategoryUrl('vidbee', 'posts')).toBe(
      'https://www.instagram.com/vidbee/posts/'
    )
    expect(buildInstagramCategoryUrl('vidbee', 'stories')).toBe(
      'https://www.instagram.com/stories/vidbee/'
    )
    expect(buildInstagramCategoryUrl('vidbee', 'highlights')).toBe(
      'https://www.instagram.com/vidbee/highlights/'
    )
  })
})

describe('VSCO gallery URL routing', () => {
  it.each([
    [
      'https://vsco.co/allybari/gallery?utm_source=test',
      {
        username: 'allybari',
        profileUrl: 'https://vsco.co/allybari/gallery'
      }
    ],
    [
      'https://www.vsco.co/vidbee.example/images/',
      {
        username: 'vidbee.example',
        profileUrl: 'https://vsco.co/vidbee.example/gallery'
      }
    ],
    [
      'http://ignored:credentials@vsco.co:8080/allybari/gallery?utm_source=test',
      {
        username: 'allybari',
        profileUrl: 'https://vsco.co/allybari/gallery'
      }
    ]
  ])('normalizes a supported profile gallery alias: %s', (url, expected) => {
    expect(normalizeVscoGalleryUrl(url)).toEqual(expected)
  })

  it.each([
    'https://vsco.co/allybari/journal/',
    'https://vsco.co/allybari/gallery/item-id',
    'https://vsco.co.example.com/allybari/gallery',
    'https://example.com/vsco.co/allybari/gallery',
    'ftp://vsco.co/allybari/gallery'
  ])('rejects a non-gallery or rehosted URL: %s', (url) => {
    expect(normalizeVscoGalleryUrl(url)).toBeNull()
  })

  it('normalizes a VSCO profile root', () => {
    expect(normalizeVscoGalleryUrl('https://vsco.co/elizabethpaigee')).toEqual({
      username: 'elizabethpaigee',
      profileUrl: 'https://vsco.co/elizabethpaigee/gallery'
    })
  })

  it('routes VSCO galleries and Instagram URLs through gallery-dl', () => {
    expect(shouldUseGalleryDl('https://vsco.co/allybari/gallery')).toBe(true)
    expect(shouldUseGalleryDl('https://www.instagram.com/vidbee/')).toBe(true)
    expect(shouldUseGalleryDl('https://example.com/allybari/gallery')).toBe(false)
    expect(shouldUseGalleryDl('not a URL')).toBe(false)
  })

  it('uses a non-transcribable multi-file task kind for VSCO galleries', () => {
    const kind = resolveDownloadTaskKind('https://vsco.co/allybari/gallery', 'video')

    expect(kind).toBe('vsco-gallery')
    expect(TRANSCRIBABLE_TASK_KINDS.has(kind)).toBe(false)
    expect(resolveDownloadTaskKind('https://example.com/video', 'video')).toBe('video')
  })

  it('uses collision-safe VSCO ids without changing the Instagram default', () => {
    expect(resolveDefaultGalleryDlFilenameTemplate('https://vsco.co/allybari/gallery')).toBe(
      '{id}.{extension}'
    )
    expect(resolveDefaultGalleryDlFilenameTemplate('https://www.vsco.co/allybari/images/')).toBe(
      '{id}.{extension}'
    )
    expect(resolveDefaultGalleryDlFilenameTemplate('https://www.instagram.com/vidbee/')).toBe(
      '{sidecar_media_id:?/_/}{media_id}.{extension}'
    )
  })

  it('cannot override the collision-safe VSCO filename with a generic media template', () => {
    const options = {
      customFilenameTemplate: '%(title)s.%(ext)s',
      galleryDlFilenameTemplate: '{media_id}.{extension}'
    }

    expect(resolveGalleryDlFilenameTemplate('https://vsco.co/allybari/gallery', options)).toBe(
      '{id}.{extension}'
    )
  })
})

describe('gallery-dl runtime settings', () => {
  it('enables VSCO videos and paces profile API requests', () => {
    expect(VSCO_GALLERY_DL_EXTRACTOR_ARGS).toEqual([
      '-o',
      'extractor.vsco.tls12=true',
      '-o',
      'extractor.vsco.videos=true',
      '--sleep-request',
      '1',
      '--sleep-429',
      '60',
      '--retries',
      '8'
    ])
  })

  it('preserves video-backed Instagram stories and highlights', () => {
    expect(INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS).toContain('extractor.instagram.videos=true')
    expect(INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS).toContain('extractor.instagram.static-videos=true')
    expect(INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS).not.toContain(
      'extractor.instagram.static-videos=false'
    )
  })

  it('forwards browser cookies, cookie files, and proxy settings', () => {
    expect(
      buildGalleryDlRuntimeArgs({
        browserForCookies: 'firefox',
        cookiesPath: '/tmp/cookies.txt',
        proxy: 'socks5://127.0.0.1:1080'
      })
    ).toEqual([
      '--cookies-from-browser',
      'firefox',
      '--cookies',
      '/tmp/cookies.txt',
      '--proxy',
      'socks5://127.0.0.1:1080'
    ])
  })
})

describe('Instagram highlight downloads', () => {
  it('routes highlights into title-based directories', async () => {
    const add = vi.fn(async () => ({ id: 'highlight-task' }))
    const queue = {
      add,
      setMaxPerGroup: vi.fn(async () => undefined)
    } as unknown as TaskQueueAPI
    const inspector = {
      get: () => ({
        inspection: {
          inspectionId: 'inspection-id',
          expiresAt: Date.now() + 60_000,
          complete: true,
          profile: {
            username: 'vidbee',
            profileUrl: 'https://www.instagram.com/vidbee/'
          },
          categories: [
            {
              category: 'highlights',
              state: 'ready',
              sourceCount: 2,
              assetCount: 4
            }
          ],
          totalSourceCount: 2,
          totalAssetCount: 4
        },
        categoryUrls: {
          highlights: 'https://www.instagram.com/vidbee/highlights/'
        }
      })
    } as unknown as InstagramProfileInspector

    await enqueueInstagramProfileDownload({
      queue,
      inspector,
      input: {
        inspectionId: 'inspection-id',
        categories: ['highlights']
      },
      defaultDownloadDir: '/downloads'
    })

    expect(add).toHaveBeenCalledOnce()
    expect(add.mock.calls[0]?.[0].input.options).toMatchObject({
      customDownloadPath: path.join('/downloads', 'Instagram', 'vidbee', 'Highlights'),
      galleryDlBaseDirectory: path.join('/downloads', 'Instagram', 'vidbee'),
      galleryDlDirectorySegments: ['Highlights', '{highlight_title}'],
      galleryDlDirectoryTemplate: path.join('/downloads', 'Instagram', 'vidbee', 'Highlights')
    })
  })
})

describe('Instagram post downloads', () => {
  it('excludes reels from the posts category', async () => {
    const add = vi.fn(async () => ({ id: 'post-task' }))
    const queue = {
      add,
      setMaxPerGroup: vi.fn(async () => undefined)
    } as unknown as TaskQueueAPI
    const inspector = {
      get: () => ({
        inspection: {
          inspectionId: 'inspection-id',
          expiresAt: Date.now() + 60_000,
          complete: true,
          profile: {
            username: 'vidbee',
            profileUrl: 'https://www.instagram.com/vidbee/'
          },
          categories: [
            {
              category: 'posts',
              state: 'ready',
              sourceCount: 3,
              assetCount: 5
            }
          ],
          totalSourceCount: 3,
          totalAssetCount: 5
        },
        categoryUrls: {
          posts: 'https://www.instagram.com/vidbee/posts/'
        }
      })
    } as unknown as InstagramProfileInspector

    await enqueueInstagramProfileDownload({
      queue,
      inspector,
      input: {
        inspectionId: 'inspection-id',
        categories: ['posts']
      },
      defaultDownloadDir: '/downloads'
    })

    expect(add).toHaveBeenCalledOnce()
    expect(add.mock.calls[0]?.[0].input.options).toMatchObject({
      galleryDlFilter: "type == 'post'"
    })
  })
})

describe('gallery server backoff', () => {
  it('allows announced rate-limit waits without disabling stall detection', () => {
    expect(
      galleryWaitDurationMs(
        '[vsco][info] Waiting for 1 minutes until 01:48:20 (429 Too Many Requests)'
      )
    ).toBe(60_000)
    expect(galleryWaitDurationMs('[vsco][info] Waiting for 2.5 seconds until 01:48:20')).toBe(2500)
    expect(galleryWaitDurationMs('[vsco][info] Waiting for 999 minutes until later')).toBe(600_000)
    expect(galleryWaitDurationMs('unrelated log line')).toBeUndefined()
  })
})
