import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import { OnlyFansProfiles } from '@vidbee/browser-capture/onlyfans-profile'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { NODE } from './fixtures/node-runtime.js'

const seams = vi.hoisted(() => ({ launch: vi.fn(), now: 1000, jump: 0, delays: [] as number[], fileOps: [] as string[], renameFailure: undefined as Error | undefined, renameSuffix: '', statFailure: undefined as Error | undefined }))
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>()
  return { ...real,
    renameSync: (...args: Parameters<typeof real.renameSync>) => {
      seams.fileOps.push(`rename:${String(args[0])}`)
      if (seams.renameFailure && String(args[0]).endsWith(seams.renameSuffix)) throw seams.renameFailure
      return real.renameSync(...args)
    },
    statSync: (...args: Parameters<typeof real.statSync>) => {
      seams.fileOps.push(`stat:${String(args[0])}`)
      if (seams.statFailure && String(args[0]).endsWith('/100_1.jpg')) throw seams.statFailure
      return real.statSync(...args)
    }
  }
})
vi.mock('playwright-core', () => ({ chromium: { launchPersistentContext: seams.launch } }))
vi.mock('../src/availability', () => ({ resolveBrowserExecutable: () => '/synthetic/chromium' }))
vi.mock('node:timers/promises', async (original) => {
  const real = await original<typeof import('node:timers/promises')>()
  return { ...real, setTimeout: async (ms: number, _value: undefined, options: { signal: AbortSignal }) => {
    seams.delays.push(ms)
    seams.now += seams.jump || ms
    await real.setTimeout(1)
    options.signal.throwIfAborted()
  } }
})

const url = 'https://onlyfans.com/example'
const ownerUrl = 'https://onlyfans.com/api2/v2/users/example'
const feedUrl = 'https://onlyfans.com/api2/v2/users/7/posts/medias'
const mediaUrl = 'https://cdn2.onlyfans.com/files/one.jpg?Signature=synthetic'
const roots: string[] = []
const owners: OnlyFansProfiles[] = []
const payload = (id = 1, hasMore = false) => ({ list: [{ id: 100, media: [{ id, type: 'photo', files: { full: { url: mediaUrl } } }] }], hasMore })
const response = (responseUrl: string, body: unknown, status = 200) => ({
  url: () => responseUrl, ok: () => status >= 200 && status < 300, status: () => status, json: vi.fn(async () => body)
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function turns() { for (let index = 0; index < 40; index += 1) await Promise.resolve() }
function setup(saved = false) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'vidbee-mapping-characterization-'))
  roots.push(directory)
  const events = new EventEmitter()
  const filename = path.join(directory, 'example.json')
  if (saved) writeFileSync(filename, JSON.stringify({ username: 'example', profileUrl: url, state: 'complete', updatedAt: 1, pages: 1, items: [{ id: '1', postId: '100', category: 'photos', state: 'available', downloaded: false }] }))
  const covers: unknown[] = []
  const context = {
    pages: () => [page], on: vi.fn(), close: vi.fn(async () => undefined),
    cookies: vi.fn(async () => [{ name: 'sess' }, { name: 'auth_id' }])
  }
  let currentUrl = url
  const page = {
    bringToFront: vi.fn(async () => undefined),
    isClosed: () => false, context: () => context, url: () => currentUrl,
    on: events.on.bind(events), off: events.off.bind(events),
    goto: vi.fn(async (next: string) => { currentUrl = next }),
    evaluate: vi.fn(async (): Promise<boolean | { width: number; height: number }> => false),
    waitForResponse: vi.fn(async (_predicate?: unknown, _options?: unknown) => response('https://onlyfans.com/api2/v2/posts/100', payload().list[0])),
    getByText: vi.fn(() => ({ all: vi.fn(async () => covers) })),
    locator: vi.fn(() => ({ first: () => ({ getAttribute: async () => null }) }))
  }
  seams.launch.mockResolvedValue(context)
  const profiles = new OnlyFansProfiles(directory, () => directory)
  owners.push(profiles)
  return { directory, filename, events, context, page, profiles, covers }
}
async function settled(fixture: ReturnType<typeof setup>) {
  await vi.waitFor(() => {
    expect(fixture.profiles.get(url).state).not.toBe('mapping')
    expect(fixture.events.listenerCount('response')).toBe(0)
  }, { timeout: 5000 })
  await turns()
  return fixture.profiles.get(url)
}
beforeEach(() => { seams.now = 1000; seams.jump = 0; seams.delays = []; seams.fileOps = []; seams.renameFailure = undefined; seams.renameSuffix = ''; seams.statFailure = undefined; vi.spyOn(Date, 'now').mockImplementation(() => seams.now) })
afterEach(async () => {
  seams.renameFailure = undefined; seams.statFailure = undefined
  for (const owner of owners.splice(0)) await owner.stop()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals()
})

describe('serialized browser response characterization', () => {
  it('starts mapping/save synchronously, delays JSON until response return and retains owner-before-feed order', async () => {
    const fixture = setup()
    const gate = deferred<unknown>()
    const owner = response(ownerUrl, { id: 7 })
    owner.json.mockImplementation(() => gate.promise)
    const feed = response(feedUrl, payload())
    const command = fixture.profiles.command({ url, action: 'map' })
    expect(fixture.profiles.get(url)).toMatchObject({ state: 'mapping', pages: 0, category: 'media' })
    expect(JSON.parse(readFileSync(fixture.filename, 'utf8')).state).toBe('mapping')
    await command
    await turns()
    fixture.events.emit('response', owner)
    fixture.events.emit('response', feed)
    expect(owner.json).not.toHaveBeenCalled()
    expect(feed.json).not.toHaveBeenCalled()
    await turns()
    expect(owner.json).toHaveBeenCalledOnce()
    expect(feed.json).not.toHaveBeenCalled()
    gate.resolve({ id: 7 })
    const result = await settled(fixture)
    expect(result).toMatchObject({ state: 'complete', pages: 1, items: [{ id: '1', downloaded: false }] })
    expect(feed.json).toHaveBeenCalledOnce()
    expect(fixture.context.cookies).toHaveBeenCalledWith('https://onlyfans.com')
  }, 15_000)

  it('ignores feed before owner identity and skips unreadable JSON before a valid batch', async () => {
    const fixture = setup()
    fixture.page.goto.mockImplementation(async () => {
      fixture.events.emit('response', response(feedUrl, payload(9)))
      fixture.events.emit('response', response(ownerUrl, { id: 7 }))
      const unreadable = response(feedUrl, null)
      unreadable.json.mockRejectedValue(new Error('evicted response'))
      fixture.events.emit('response', unreadable)
      fixture.events.emit('response', response(feedUrl, payload()))
    })
    await fixture.profiles.command({ url, action: 'map' })
    const result = await settled(fixture)
    expect(result).toMatchObject({ state: 'complete', pages: 1, items: [{ id: '1' }] })
    expect(result.error).toBeUndefined()
  }, 15_000)

  it.each([401, 403, 429, 500])('maps feed HTTP %s into its exact terminal state and error', async (status) => {
    const fixture = setup()
    fixture.page.goto.mockImplementation(async () => {
      fixture.events.emit('response', response(ownerUrl, { id: 7 }))
      fixture.events.emit('response', response(feedUrl, {}, status))
    })
    await fixture.profiles.command({ url, action: 'map' })
    expect(await settled(fixture)).toMatchObject({ state: [401, 403].includes(status) ? 'auth-required' : 'error', pages: 0,
      error: status === 429 ? 'OnlyFans asked to slow down. Stop and retry later.' : 'OnlyFans could not load this page. Check the dedicated browser.' })
  }, 15_000)

  it.each([401, 403, 429, 500])('owner HTTP %s terminates without adding feed error text', async (status) => {
    const fixture = setup()
    fixture.page.goto.mockImplementation(async () => { fixture.events.emit('response', response(ownerUrl, {}, status)) })
    await fixture.profiles.command({ url, action: 'map' })
    const result = await settled(fixture)
    expect(result.state).toBe([401, 403].includes(status) ? 'auth-required' : 'error')
    expect(result.error).toBeUndefined()
  }, 15_000)

  it('retains response-chain error state while draining a later successful response', async () => {
    const fixture = setup()
    fixture.page.goto.mockImplementation(async () => {
      fixture.events.emit('response', { ...response(ownerUrl, null), url: () => { throw new RangeError('synthetic response URL failure') } })
      fixture.events.emit('response', response(ownerUrl, { id: 7 }))
      fixture.events.emit('response', response(feedUrl, payload()))
    })
    await fixture.profiles.command({ url, action: 'map' })
    expect(await settled(fixture)).toMatchObject({ state: 'error', pages: 1, items: [{ id: '1' }], error: 'Mapping stopped while processing a response (RangeError). The saved map has been retained.' })
  }, 15_000)

  it.each([{ error: 'denied' }, { success: false }])('retains auth-required for feed application error %j', async (body) => {
    const fixture = setup()
    fixture.page.goto.mockImplementation(async () => {
      fixture.events.emit('response', response(ownerUrl, { id: 7 }))
      fixture.events.emit('response', response(feedUrl, body))
    })
    await fixture.profiles.command({ url, action: 'map' })
    const result = await settled(fixture)
    expect(result.state).toBe('auth-required'); expect(result.error).toBeUndefined()
  }, 15_000)

  it('requires both named cookies before navigation', async () => {
    const fixture = setup()
    fixture.context.cookies.mockResolvedValue([{ name: 'sess' }])
    await fixture.profiles.command({ url, action: 'map' })
    await turns()
    expect(fixture.profiles.get(url).state).toBe('auth-required')
    expect(fixture.page.goto).not.toHaveBeenCalled()
  }, 15_000)

  it.each([false, true])('inactivity timeout preserves observed API diagnostics, observed=%s', async (observed) => {
    const fixture = setup()
    seams.jump = 8 * 60_000
    fixture.page.goto.mockImplementation(async () => {
      if (observed) for (let index = 0; index < 14; index += 1) fixture.events.emit('response', response(`https://onlyfans.com/api2/v2/unknown/${index}`, {}))
    })
    await fixture.profiles.command({ url, action: 'map' })
    const result = await settled(fixture)
    expect(result.state).toBe('partial')
    expect(result.error).toBe(observed
      ? `No matching media response was captured. Observed API paths: ${Array.from({ length: 12 }, (_, index) => `/api2/v2/unknown/${index}`).join(', ')}`
      : 'No media API response was captured. Check that the page loaded in the dedicated browser.')
    expect(seams.delays.every((ms) => ms === 250)).toBe(true)
  }, 15_000)

  it('two-hour deadline keeps partial media and unreadable-response diagnostics', async () => {
    const fixture = setup()
    seams.jump = 2 * 60 * 60_000
    fixture.page.goto.mockImplementation(async () => {
      fixture.events.emit('response', response(ownerUrl, { id: 7 }))
      fixture.events.emit('response', response(feedUrl, payload(1, true)))
      const unreadable = response(feedUrl, null); unreadable.json.mockRejectedValue(new Error('evicted'))
      fixture.events.emit('response', unreadable)
    })
    await fixture.profiles.command({ url, action: 'map' })
    expect(await settled(fixture)).toMatchObject({ state: 'partial', pages: 1, items: [{ id: '1' }], error: 'The site did not finish loading older media. 1 response bodies could not be read; mapped items were retained.' })
  }, 15_000)

  it('stopping before page assignment does not close a page acquired afterward', async () => {
    const fixture = setup()
    const gate = deferred<typeof fixture.context>()
    seams.launch.mockImplementation(() => gate.promise)
    await fixture.profiles.command({ url, action: 'map' })
    const stopping = fixture.profiles.command({ url, action: 'stop' })
    gate.resolve(fixture.context)
    await stopping
    expect(fixture.profiles.get(url).state).toBe('partial')
    expect(fixture.context.close).not.toHaveBeenCalled()
    expect(fixture.events.listenerCount('response')).toBe(0)
  }, 15_000)
})

describe('refresh status and covered-media characterization', () => {
  it.each([403, 429, 500])('refresh HTTP %s preserves retry admission and exact error', async (status) => {
    const fixture = setup(true)
    fixture.page.waitForResponse.mockResolvedValue(response('https://onlyfans.com/api2/v2/posts/100', {}, status))
    const fetchMedia = vi.fn(); vi.stubGlobal('fetch', fetchMedia)
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toThrow(status === 429 ? 'OnlyFans asked to slow down. Retry later.' : `The post request failed (HTTP ${status}). Check access in the dedicated browser.`)
    expect(fixture.page.goto).toHaveBeenCalledTimes(status === 429 ? 1 : 2)
    expect(seams.delays).toEqual(status === 429 ? [] : [1500])
    expect(fetchMedia).not.toHaveBeenCalled()
  }, 15_000)

  it('refresh response rejection becomes missing-response guidance without retry', async () => {
    const fixture = setup(true)
    fixture.page.waitForResponse.mockRejectedValue(new Error('response deadline'))
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toThrow('The post did not return media in the dedicated browser. Reopen it and retry.')
    expect(fixture.page.goto).toHaveBeenCalledOnce()
  }, 15_000)

  it('retries a failed refresh then downloads the matching original with no 1500ms production wait', async () => {
    const fixture = setup(true)
    fixture.page.waitForResponse.mockResolvedValueOnce(response('https://onlyfans.com/api2/v2/posts/100', {}, 500))
    const fetchMedia = vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } })); vi.stubGlobal('fetch', fetchMedia)
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).resolves.toMatchObject({ size: 1 })
    expect(seams.delays).toEqual([1500]); expect(fixture.page.goto).toHaveBeenCalledTimes(2)
    expect(fetchMedia).toHaveBeenCalledOnce()
  }, 15_000)

  it.each([0, 2])('does not click when %s covers are visible', async (count) => {
    const fixture = setup(true)
    fixture.page.waitForResponse.mockResolvedValue(response('https://onlyfans.com/api2/v2/posts/100', { id: 100, media: [] }))
    const click = vi.fn()
    for (let index = 0; index < count; index += 1) fixture.covers.push({ isVisible: async () => true, boundingBox: async () => ({ x: 1, y: 1, width: 100, height: 20 }), click })
    fixture.page.evaluate.mockResolvedValue({ width: 1920, height: 1080 })
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toThrow('This media is locked or has no downloadable original.')
    expect(click).not.toHaveBeenCalled()
    expect(fixture.page.waitForResponse).toHaveBeenCalledOnce()
  }, 15_000)
})

describe('covered-media matching and transfer finalization faults', () => {
  it('counts only visible in-viewport covers, waits before clicking and filters the opened response', async () => {
    const fixture = setup(true)
    const empty = response('https://onlyfans.com/api2/v2/posts/100', { id: 100, media: [] })
    fixture.page.evaluate.mockResolvedValue({ width: 1920, height: 1080 })
    const order: string[] = []
    const click = vi.fn(async () => { order.push('click') })
    fixture.covers.push(
      { isVisible: async () => false, boundingBox: vi.fn(), click: vi.fn() },
      { isVisible: async () => true, boundingBox: async () => ({ x: 2000, y: 0, width: 20, height: 20 }), click: vi.fn() },
      { isVisible: async () => true, boundingBox: async () => null, click: vi.fn() },
      { isVisible: async () => true, boundingBox: async () => ({ x: 10, y: 20, width: 100, height: 20 }), click }
    )
    fixture.page.waitForResponse.mockImplementationOnce(async () => empty).mockImplementationOnce(async () => {
      order.push('wait-opened')
      return response('https://onlyfans.com/api2/v2/posts/100', payload().list[0])
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } })))
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).resolves.toMatchObject({ size: 1 })
    expect(order).toEqual(['wait-opened', 'click'])
    expect(click).toHaveBeenCalledWith({ timeout: 5000 })
    expect(fixture.page.waitForResponse.mock.calls[1]?.[1]).toEqual({ timeout: 15_000 })
    const predicate = fixture.page.waitForResponse.mock.calls[1]?.[0]
    if (typeof predicate !== 'function') throw new Error('Missing public waitForResponse predicate')
    expect(await predicate(response('https://onlyfans.com/api2/v2/posts/101', payload().list[0]))).toBe(false)
    expect(await predicate(response('https://onlyfans.com/api2/v2/posts/100', payload().list[0], 403))).toBe(false)
    expect(await predicate(response('https://onlyfans.com/api2/v2/posts/100', payload(9).list[0]))).toBe(false)
    expect(await predicate(response('https://onlyfans.com/api2/v2/posts/100', payload().list[0]))).toBe(true)
  }, 15_000)

  it.each(['rename', 'save', 'stat'])('preserves the exact %s failure and resulting media/profile state', async (operation) => {
    const fixture = setup(true)
    const target = path.join(fixture.directory, 'OnlyFans/example/photos/100_1.jpg')
    const failure = new Error(`synthetic ${operation} failure`)
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (operation === 'stat') seams.statFailure = failure
      else { seams.renameFailure = failure; seams.renameSuffix = operation === 'rename' ? '/100_1.jpg.part' : '/example.json.tmp' }
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    }))
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toBe(failure)
    expect(existsSync(target)).toBe(operation !== 'rename')
    expect(existsSync(`${target}.part`)).toBe(operation === 'rename')
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(operation !== 'rename')
    expect(JSON.parse(readFileSync(fixture.filename, 'utf8')).items[0].downloaded).toBe(operation === 'stat')
    if (operation === 'save') {
      expect(JSON.parse(readFileSync(`${fixture.filename}.tmp`, 'utf8')).items[0].downloaded).toBe(true)
      expect(seams.fileOps).not.toContain(`stat:${target}`)
    }
    if (operation === 'stat') expect(seams.fileOps.slice(-3)).toEqual([`rename:${target}.part`, `rename:${fixture.filename}.tmp`, `stat:${target}`])
  }, 15_000)

  it('releases the body reader when a reader failure propagates', async () => {
    const fixture = setup(true)
    const failure = new Error('synthetic body read rejection')
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(failure) } })
    const supplied = new Response(body, { headers: { 'content-type': 'image/jpeg' } })
    const reader = body.getReader()
    const release = vi.spyOn(reader, 'releaseLock')
    vi.spyOn(body, 'getReader').mockReturnValue(reader)
    vi.stubGlobal('fetch', vi.fn(async () => supplied))
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toBe(failure)
    expect(release).toHaveBeenCalledOnce()
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(false)
  }, 15_000)
})

describe('profile admission, interruption and save-failure characterization', () => {
  it('shares browser opening work without serializing concurrent open commands', async () => {
    const fixture = setup()
    const gate = deferred<typeof fixture.context>()
    seams.launch.mockImplementation(() => gate.promise)
    const first = fixture.profiles.command({ url, action: 'open' })
    const second = fixture.profiles.command({ url, action: 'open' })
    await turns()
    expect(seams.launch).toHaveBeenCalledOnce()
    gate.resolve(fixture.context)
    await Promise.all([first, second])
    expect(fixture.page.goto).toHaveBeenCalledTimes(2)
    expect(fixture.profiles.list()).toHaveLength(1)
  }, 15_000)

  it('rejects mapping/enqueue admission while mapping and awaits final-save failure on stop', async () => {
    const fixture = setup()
    const navigation = deferred<void>()
    fixture.page.goto.mockImplementation(() => navigation.promise)
    await fixture.profiles.command({ url, action: 'map' })
    await turns()
    await expect(fixture.profiles.command({ url, action: 'map' })).rejects.toThrow('Another OnlyFans operation is running. Stop it or wait for it to finish.')
    const queue = new TaskQueueAPI({ persist: new MemoryPersistAdapter(), idleQueueKickMs: 0, executor: { run() { return { cancel: async () => undefined, pause: async () => undefined } } } })
    await expect(fixture.profiles.enqueue(queue, { url, itemIds: ['1'] })).rejects.toThrow('Finish or stop OnlyFans mapping before downloading.')
    const failure = new Error('synthetic final-save rename failure')
    const stopping = fixture.profiles.command({ url, action: 'stop' })
    seams.renameFailure = failure; seams.renameSuffix = '/example.json.tmp'
    navigation.resolve(undefined)
    await expect(stopping).rejects.toBe(failure)
    expect(fixture.profiles.get(url).state).toBe('partial')
    expect(JSON.parse(readFileSync(fixture.filename, 'utf8')).state).toBe('mapping')
    expect(JSON.parse(readFileSync(`${fixture.filename}.tmp`, 'utf8')).state).toBe('partial')
    expect(fixture.context.close).toHaveBeenCalledOnce()
    await queue.stop()
  }, 15_000)

  it('allows enqueue while a direct download is pending and does not add a downloading guard', async () => {
    const fixture = setup(true)
    const bodyReady = deferred<void>()
    let closeBody: (() => void) | undefined
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array([1])); closeBody = () => controller.close()
    } }), { headers: { 'content-type': 'image/jpeg' } })))
    const queue = new TaskQueueAPI({ persist: new MemoryPersistAdapter(), idleQueueKickMs: 0, executor: { run() { return { cancel: async () => undefined, pause: async () => undefined } } } })
    const download = fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, () => bodyReady.resolve(undefined))
    try {
      await bodyReady.promise
      await expect(fixture.profiles.enqueue(queue, { url, itemIds: ['1'] })).resolves.toEqual({ count: 1 })
      expect(queue.list().tasks).toHaveLength(1)
      closeBody?.(); closeBody = undefined
      await expect(download).resolves.toMatchObject({ size: 1 })
    } finally { closeBody?.(); await queue.stop() }
  }, 15_000)

  it('retains midbody abort failure and releases transfer admission', async () => {
    const fixture = setup(true)
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })))
    const progress = vi.fn(() => controller.abort(new Error('synthetic abort during progress')))
    await expect(fixture.profiles.download(url, '1', fixture.directory, controller.signal, progress)).rejects.toThrow()
    expect(progress).toHaveBeenCalledOnce()
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(false)
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).resolves.toMatchObject({ size: 3 })
  }, 15_000)
})

// The native addon belongs to pinned Node; Bun only hosts the outer suite.
it.each(['borrowed', 'node'])('integrates public enqueue with a real %s SQLite queue in pinned Node', (client) => {
  const interpreter = NODE
  const fixture = fileURLToPath(new URL('./characterization-profile-queue.node.ts', import.meta.url))
  const run = spawnSync(interpreter, ['--import', 'tsx', fixture], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, VIDBEE_QUEUE_DRIVER: client } })
  expect(run.error).toBeUndefined()
  expect(run.status, run.stderr).toBe(0)
  expect(JSON.parse(run.stdout.trim())).toEqual({ node: 'v22.23.4', client, hostClientStillOpen: true, tasksPersisted: 3, deduplicated: true, retryCancelled: true, partialFailureRetained: true })
}, 40_000)
