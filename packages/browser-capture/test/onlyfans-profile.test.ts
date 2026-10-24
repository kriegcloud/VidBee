import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isOutputComplete } from '@vidbee/task-queue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chatVideoByOrdinal,
  OnlyFansBrowserExecutor,
  OnlyFansProfiles,
  onlyFansChatMediaResponse,
  onlyFansChatResponse,
  onlyFansItems,
  onlyFansMediaUrl
} from '../src/onlyfans-profile'

const fixture = {
  list: [
    {
      id: 100,
      media: [
        {
          id: 1,
          type: 'photo',
          files: { full: { url: 'https://cdn2.onlyfans.com/files/photo.jpg?Signature=private' } }
        },
        {
          id: 2,
          type: 'video',
          files: { drm: { manifest: { dash: 'https://cdn2.onlyfans.com/dash/locked.mpd' } } }
        },
        {
          id: 3,
          type: 'photo',
          canView: false,
          files: { full: { url: 'https://cdn2.onlyfans.com/files/preview.jpg' } }
        }
      ]
    }
  ],
  hasMore: false
}

const galleryFixture = {
  list: [
    {
      id: 8,
      messageId: 100,
      type: 'photo',
      files: { full: { url: 'https://cdn2.onlyfans.com/files/gallery.jpg?Signature=private' } }
    },
    { id: 9, type: 'video', canView: false, files: {} }
  ],
  hasMore: false
}

const mocks = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('playwright-core', () => ({ chromium: { launchPersistentContext: mocks.launch } }))
vi.mock('../src/availability', () => ({ resolveBrowserExecutable: () => '/usr/bin/google-chrome' }))

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function setup(auth = true, emitPosts = true, chat = false, chatRoute = 'messages') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vidbee-of-test-'))
  dirs.push(dir)
  const events = new EventEmitter()
  let closed = false
  const response = (url: string, payload: unknown) => ({
    url: () => url,
    ok: () => true,
    status: () => 200,
    json: async () => payload
  })
  const context = {
    pages: () => [page],
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    cookies: vi.fn(async () => (auth ? [{ name: 'sess' }, { name: 'auth_id' }] : []))
  }
  let currentUrl = chat
    ? 'https://onlyfans.com/my/chats/chat/7'
    : 'https://onlyfans.com/example/photos'
  const cover = {
    all: vi.fn(async () => [] as unknown[]),
    isVisible: vi.fn(async () => false),
    boundingBox: vi.fn(async () => ({ x: 100, y: 100, width: 100, height: 30 })),
    click: vi.fn(async () => undefined)
  }
  const page = {
    waitForResponse: vi.fn(async (_predicate?: unknown) =>
      response(
        chat
          ? chatRoute === 'messages'
            ? 'https://onlyfans.com/api2/v2/chats/7/messages'
            : 'https://onlyfans.com/api2/v2/chats/7/media'
          : 'https://onlyfans.com/api2/v2/posts/100',
        chat ? (chatRoute === 'messages' ? fixture : galleryFixture) : fixture.list[0]
      )
    ),
    isClosed: () => closed,
    context: () => context,
    bringToFront: vi.fn(),
    getByText: vi.fn(() => cover),
    on: events.on.bind(events),
    off: events.off.bind(events),
    close: vi.fn(async () => {
      closed = true
    }),
    url: () => currentUrl,
    evaluate: vi.fn(),
    goto: vi.fn(async (url: string) => {
      currentUrl = url
      events.emit('response', response('https://onlyfans.com/api2/v2/users/example', { id: 7 }))
      await Promise.resolve()
      if (emitPosts) {
        const galleryQuery =
          chatRoute === 'opened' || chatRoute === 'purchased'
            ? `?${chatRoute}=1`
            : chatRoute === 'photos' || chatRoute === 'videos'
              ? `?type=${chatRoute}`
              : ''
        events.emit(
          'response',
          response(
            chat
              ? chatRoute === 'messages'
                ? 'https://onlyfans.com/api2/v2/chats/7/messages'
                : `https://onlyfans.com/api2/v2/chats/7/media${galleryQuery}`
              : 'https://onlyfans.com/api2/v2/users/7/posts/medias',
            chat && chatRoute !== 'messages' ? galleryFixture : fixture
          )
        )
        await Promise.resolve()
      }
    })
  }
  mocks.launch.mockResolvedValue(context)
  return { dir, page, cover, context, profiles: new OnlyFansProfiles(dir, () => dir) }
}

describe('chat video ordinal', () => {
  it('selects the third video from a mixed message list', () => {
    const payload = {
      list: [
        {
          id: 10,
          media: [
            {
              id: 1,
              type: 'photo',
              files: { full: { url: 'https://cdn2.onlyfans.com/files/a.jpg' } }
            },
            {
              id: 2,
              type: 'video',
              duration: 11,
              files: { full: { url: 'https://cdn2.onlyfans.com/files/v1.mp4' } }
            }
          ]
        },
        {
          id: 20,
          media: [
            {
              id: 3,
              type: 'photo',
              files: { full: { url: 'https://cdn2.onlyfans.com/files/b.jpg' } }
            },
            {
              id: 4,
              type: 'video',
              duration: 22,
              files: { drm: { manifest: { dash: 'https://cdn2.onlyfans.com/dash/x.mpd' } } }
            }
          ]
        },
        {
          id: 30,
          media: [
            {
              id: 5,
              type: 'video',
              duration: 33,
              files: {
                full: { url: 'https://cdn2.onlyfans.com/files/v3.mp4' },
                thumb: { url: 'https://cdn2.onlyfans.com/files/thumbs/v3.jpg?Policy=private' }
              }
            },
            {
              id: 6,
              type: 'photo',
              files: { full: { url: 'https://cdn2.onlyfans.com/files/c.jpg' } }
            },
            {
              id: 7,
              type: 'video',
              duration: 44,
              canView: false,
              files: { full: { url: 'https://cdn2.onlyfans.com/files/v4.mp4' } }
            }
          ]
        }
      ]
    }
    const third = chatVideoByOrdinal(payload, 3)
    expect(third).toMatchObject({ id: '5', postId: '30', state: 'available', durationSec: 33 })
    expect(third?.id).not.toBe(chatVideoByOrdinal(payload, 1)?.id)
    expect(third?.previewPath).toBe('/files/thumbs/v3.jpg')
    expect(onlyFansItems(payload).find((entry) => entry.item.id === third?.id)?.item.category).toBe(
      'videos'
    )
  })
})

describe('OnlyFans browser mapping', () => {
  it('limits chat responses to the selected conversation', () => {
    expect(
      onlyFansChatResponse(new URL('https://onlyfans.com/api2/v2/chats/7/messages?limit=10'), '7')
    ).toBe(true)
    for (const url of [
      'https://onlyfans.com/api2/v2/chats/8/messages',
      'https://onlyfans.com/api2/v2/chats/7/messages/like',
      'https://evil.test/api2/v2/chats/7/messages'
    ]) {
      expect(onlyFansChatResponse(new URL(url), '7')).toBe(false)
    }
  })

  it('matches only the selected chat gallery filter', () => {
    const base = 'https://onlyfans.com/api2/v2/chats/7/media?limit=10'
    for (const [route, query] of [
      ['gallery', ''],
      ['opened', '&opened=1'],
      ['purchased', '&purchased=1'],
      ['photos', '&type=photos'],
      ['videos', '&type=videos']
    ] as const) {
      expect(onlyFansChatMediaResponse(new URL(`${base}${query}`), '7', route)).toBe(true)
      expect(onlyFansChatMediaResponse(new URL(`${base}${query}`), '8', route)).toBe(false)
    }
    expect(onlyFansChatMediaResponse(new URL(`${base}&opened=1`), '7', 'gallery')).toBe(false)
    expect(onlyFansChatMediaResponse(new URL(base), '7', 'purchased')).toBe(false)
  })

  it.each([
    ['gallery', 'gallery'],
    ['gallery/opened', 'opened'],
    ['gallery/purchased', 'purchased'],
    ['gallery/photos', 'photos'],
    ['gallery/videos', 'videos']
  ])('maps chat /%s and saves its own media references', async (suffix, route) => {
    const { profiles, dir, page } = setup(true, true, true, route)
    const url = `https://onlyfans.com/my/chats/chat/7/${suffix}`
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    expect(page.goto).toHaveBeenCalledWith(url, expect.anything())
    expect(profiles.get(url).items.map((entry) => entry.id)).toEqual(['8', '9'])
    expect(profiles.get(url).items[0]).toMatchObject({ postId: '100', state: 'available' })
    expect(profiles.get('https://onlyfans.com/my/chats/chat/7').items).toHaveLength(0)
    expect(readFileSync(path.join(dir, `7-${route}.json`), 'utf8')).not.toContain('Signature')
    expect(new OnlyFansProfiles(dir, () => dir).list()[0].profileUrl).toBe(url)
    await profiles.stop()
  })

  it('maps mixed chat attachments, reopens saved chats, and refreshes the message before download', async () => {
    const { profiles, dir, page } = setup(true, true, true)
    const url = 'https://onlyfans.com/my/chats/chat/7'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    expect(page.goto).toHaveBeenCalledWith(url, expect.anything())
    expect(profiles.get(url)).toMatchObject({ chatId: '7', category: 'media' })
    expect(profiles.get(url).items.map((item) => item.category)).toEqual([
      'photos',
      'videos',
      'photos'
    ])
    const saved = readFileSync(path.join(dir, '7.json'), 'utf8')
    expect(saved).not.toContain('Signature')
    const restored = new OnlyFansProfiles(dir, () => dir)
    expect(restored.list()[0]).toMatchObject({ profileUrl: url, chatId: '7' })
    expect(restored.get('https://onlyfans.com/example').items).toHaveLength(0)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { 'content-type': 'image/jpeg' }
          })
      )
    )
    const output = await profiles.download(url, '1', dir, new AbortController().signal, vi.fn())
    expect(output.size).toBe(4)
    expect(page.goto).toHaveBeenLastCalledWith(`${url}?firstId=100`, expect.anything())
    const predicate = page.waitForResponse.mock.calls[0]?.[0] as unknown as (
      response: unknown
    ) => Promise<boolean>
    const candidate = (chatId: number, payload: unknown) => ({
      url: () => `https://onlyfans.com/api2/v2/chats/${chatId}/messages`,
      ok: () => true,
      json: async () => payload
    })
    expect(await predicate(candidate(8, fixture))).toBe(false)
    expect(await predicate(candidate(7, { list: [] }))).toBe(false)
    expect(await predicate(candidate(7, fixture))).toBe(true)
    await profiles.stop()
  })

  it('refreshes a gallery attachment through its direct chat media route', async () => {
    const { profiles, dir, page } = setup(true, true, true, 'gallery')
    const url = 'https://onlyfans.com/my/chats/chat/7/gallery'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { 'content-type': 'image/jpeg' }
          })
      )
    )
    const output = await profiles.download(url, '8', dir, new AbortController().signal, vi.fn())
    expect(output.size).toBe(4)
    expect(page.goto).toHaveBeenLastCalledWith(
      'https://onlyfans.com/my/chats/chat/7/media/8',
      expect.anything()
    )
    expect(profiles.get(url).items[0].downloaded).toBe(true)
    await profiles.stop()
  })

  it('scrolls chat history upward and retains a partial map on stop', async () => {
    const { profiles, page } = setup(true, false, true)
    const url = 'https://onlyfans.com/my/chats/chat/7'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(page.evaluate).toHaveBeenCalled())
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), { nested: true, chat: true })
    await profiles.command({ url, action: 'stop' })
    expect(profiles.get(url).state).toBe('partial')
    await profiles.stop()
  })

  it('distinguishes original, DRM and inaccessible media', () => {
    const items = onlyFansItems(fixture)
    expect(items.map(({ item }) => item.state)).toEqual(['available', 'drm', 'locked'])
    expect(items[2].mediaUrl).toBeNull()
    expect(onlyFansMediaUrl('https://cdn2.onlyfans.com.evil.test/files/a.jpg')).toBeNull()
    expect(onlyFansMediaUrl('http://cdn2.onlyfans.com/files/a.jpg')).toBeNull()
    expect(onlyFansMediaUrl('https://onlyfans.com/api2/v2/users/me')).toBeNull()
  })

  it('does not open covered media when the mapped item is locked', async () => {
    const { profiles, page, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    await expect(
      profiles.download(url, '3', dir, new AbortController().signal, vi.fn())
    ).rejects.toThrow('Map this available media')
    expect(page.getByText).not.toHaveBeenCalled()
    await profiles.stop()
  })

  it('reads direct gallery media from alternate list envelopes without saving signed URLs', () => {
    const items = onlyFansItems({
      items: [
        {
          id: 11,
          type: 'gif',
          files: {
            source: { url: 'https://cdn2.onlyfans.com/files/animation.gif?Signature=private' }
          }
        }
      ]
    })
    expect(items[0].item).toMatchObject({
      id: '11',
      postId: '11',
      category: 'photos',
      state: 'available'
    })
    expect(items[0].mediaUrl).toContain('/files/animation.gif')
  })

  it('requires its own login without importing cookies or starting a map request', async () => {
    const { profiles, page, dir } = setup(false)
    await profiles.command({ url: 'https://onlyfans.com/example', action: 'map' })
    await vi.waitFor(() =>
      expect(profiles.get('https://onlyfans.com/example').state).toBe('auth-required')
    )
    expect(page.goto).not.toHaveBeenCalled()
    expect(mocks.launch.mock.calls[0][0]).toBe(path.join(dir, 'browser-session'))
    expect(mocks.launch.mock.calls[0][1]).toMatchObject({ headless: false, viewport: null })
    await profiles.stop()
  })

  it('persists deduplicated references, never signed URLs, and reloads saved profiles', async () => {
    const { profiles, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'), { timeout: 2500 })
    expect(profiles.get(url).category).toBe('media')
    expect(profiles.get(url).items).toHaveLength(3)
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'), { timeout: 2500 })
    expect(profiles.get(url).items).toHaveLength(3)
    expect(readFileSync(path.join(dir, 'example.json'), 'utf8')).not.toContain('Signature')
    expect(new OnlyFansProfiles(dir, () => dir).list()[0].items).toHaveLength(3)
    await profiles.stop()
  })

  it('stops an unfinished map and retains its saved state', async () => {
    const { profiles, page, context } = setup(true, false)
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(page.evaluate).toHaveBeenCalled())
    await profiles.command({ url, action: 'stop' })
    expect(profiles.get(url).state).toBe('partial')
    expect(context.close).toHaveBeenCalledOnce()
    await profiles.stop()
  })

  it('refreshes original media in the browser, downloads without cookies, and saves only finished files', async () => {
    const { profiles, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    const fetchMedia = vi.fn(
      async () =>
        new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
        })
    )
    vi.stubGlobal('fetch', fetchMedia)
    const result = await profiles.download(url, '1', dir, new AbortController().signal, vi.fn())
    expect(result.size).toBe(4)
    expect(existsSync(result.filePath)).toBe(true)
    expect(existsSync(`${result.filePath}.part`)).toBe(false)
    const request = fetchMedia.mock.calls[0] as unknown as [string, RequestInit]
    expect(request[1].headers).toEqual({ Referer: 'https://onlyfans.com/' })
    expect(request[1].redirect).toBe('error')
    expect(profiles.get(url).items.find((item) => item.id === '1')?.downloaded).toBe(true)
    await profiles.stop()
  })

  it('opens a covered mapped photo and accepts only its matching original response', async () => {
    const { profiles, page, cover, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    page.waitForResponse
      .mockResolvedValueOnce({
        url: () => 'https://onlyfans.com/api2/v2/posts/100',
        ok: () => true,
        status: () => 200,
        json: async () => ({
          id: 100,
          media: [{ id: 1, type: 'photo', files: { preview: { url: 'https://cdn2.onlyfans.com/files/preview.jpg' } } }]
        })
      })
      .mockResolvedValueOnce({
        url: () => 'https://onlyfans.com/api2/v2/posts/100',
        ok: () => true,
        status: () => 200,
        json: async () => fixture.list[0]
      })
    cover.all.mockResolvedValue([cover])
    cover.isVisible.mockResolvedValue(true)
    page.evaluate.mockResolvedValue({ width: 1920, height: 1080 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { 'content-type': 'image/jpeg' }
      }))
    )

    const result = await profiles.download(url, '1', dir, new AbortController().signal, vi.fn())
    expect(result.size).toBe(4)
    expect(page.getByText).toHaveBeenCalledWith('Click to open', { exact: true })
    expect(cover.click).toHaveBeenCalledOnce()
    const openedPredicate = page.waitForResponse.mock.calls[1]?.[0] as unknown as (
      candidate: unknown
    ) => Promise<boolean>
    const openedResponse = (mediaId: number) => ({
      url: () => 'https://onlyfans.com/api2/v2/posts/100',
      ok: () => true,
      json: async () => ({
        id: 100,
        media: [{
          id: mediaId,
          type: 'photo',
          files: { full: { url: 'https://cdn2.onlyfans.com/files/photo.jpg' } }
        }]
      })
    })
    expect(await openedPredicate(openedResponse(2))).toBe(false)
    expect(await openedPredicate(openedResponse(1))).toBe(true)
    expect(profiles.get(url).items.find((entry) => entry.id === '1')?.downloaded).toBe(true)
    await profiles.stop()
  })

  it('retries a transient failed post response before downloading another photo from that post', async () => {
    const { profiles, page, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    page.waitForResponse.mockResolvedValueOnce({
      url: () => 'https://onlyfans.com/api2/v2/posts/100',
      ok: () => false,
      status: () => 403,
      json: async () => ({})
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { 'content-type': 'image/jpeg' }
          })
      )
    )

    const result = await profiles.download(url, '1', dir, new AbortController().signal, vi.fn())
    expect(result.size).toBe(4)
    expect(page.goto).toHaveBeenCalledTimes(3)
    expect(page.goto).toHaveBeenNthCalledWith(
      2,
      'https://onlyfans.com/100/example',
      expect.anything()
    )
    expect(page.goto).toHaveBeenNthCalledWith(
      3,
      'https://onlyfans.com/100/example',
      expect.anything()
    )
    expect(profiles.get(url).items[0].downloaded).toBe(true)
    await profiles.stop()
  })

  it('does not mark an HTML error page as downloaded media', async () => {
    const { profiles, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })
      )
    )
    await expect(
      profiles.download(url, '1', dir, new AbortController().signal, vi.fn())
    ).rejects.toThrow('instead of a media file')
    expect(profiles.get(url).items[0].downloaded).toBe(false)
    await profiles.stop()
  })

  it('reports photo completion with the collection manifest required by the queue', async () => {
    const { profiles, dir } = setup()
    const url = 'https://onlyfans.com/example'
    await profiles.command({ url, action: 'map' })
    await vi.waitFor(() => expect(profiles.get(url).state).toBe('complete'))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { 'content-type': 'image/jpeg' }
          })
      )
    )
    const executor = new OnlyFansBrowserExecutor(profiles, { run: vi.fn() }, () => dir)
    const events = { onSpawn: vi.fn(), onProgress: vi.fn(), onStd: vi.fn(), onFinish: vi.fn() }
    executor.run(
      {
        taskId: 'photo',
        attemptId: 'attempt',
        attemptNumber: 1,
        input: {
          url,
          kind: 'social-media',
          options: { onlyFansProfile: url, onlyFansMediaId: '1' }
        }
      },
      events
    )
    await vi.waitFor(() => expect(events.onFinish).toHaveBeenCalledOnce())
    const result = events.onFinish.mock.calls[0][0].result
    expect(result.type).toBe('success')
    expect(isOutputComplete('social-media', result.output, { filePresent: existsSync })).toBe(true)
    expect(result.output.collectionSummary.images).toBe(1)
    await profiles.stop()
  })

  it('never routes old OnlyFans queue entries to yt-dlp', async () => {
    const { profiles } = setup()
    const fallback = { run: vi.fn() }
    const executor = new OnlyFansBrowserExecutor(profiles, fallback, () => '/tmp')
    const events = { onSpawn: vi.fn(), onProgress: vi.fn(), onStd: vi.fn(), onFinish: vi.fn() }
    executor.run(
      {
        taskId: 'test',
        attemptId: 'attempt',
        attemptNumber: 1,
        input: { url: 'https://onlyfans.com/example', kind: 'video' }
      },
      events
    )
    await vi.waitFor(() => expect(events.onFinish).toHaveBeenCalledOnce())
    expect(fallback.run).not.toHaveBeenCalled()
    expect(events.onFinish.mock.calls[0][0].result.type).toBe('error')
  })
})
