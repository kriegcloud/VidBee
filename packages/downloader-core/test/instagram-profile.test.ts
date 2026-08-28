import path from 'node:path'

import type { TaskQueueAPI } from '@vidbee/task-queue'
import { describe, expect, it, vi } from 'vitest'
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
      'https://www.instagram.com/vidbee/photos/'
    )
    expect(buildInstagramCategoryUrl('vidbee', 'stories')).toBe(
      'https://www.instagram.com/stories/vidbee/'
    )
    expect(buildInstagramCategoryUrl('vidbee', 'highlights')).toBe(
      'https://www.instagram.com/vidbee/highlights/'
    )
  })
})

describe('gallery-dl runtime settings', () => {
  it('preserves video-backed Instagram stories and highlights', () => {
    expect(INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS).toContain('extractor.instagram.videos=true')
    expect(INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS).toContain(
      'extractor.instagram.static-videos=true'
    )
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
          posts: 'https://www.instagram.com/vidbee/photos/'
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
