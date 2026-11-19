import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import { OnlyFansBrowserExecutor, OnlyFansProfiles } from '@vidbee/browser-capture/onlyfans-profile'
import { FanslyProfiles } from '@vidbee/browser-capture/fansly-profile'
import { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { NODE } from './fixtures/node-runtime.js'

const seams = vi.hoisted(() => ({ launch: vi.fn(), now: 1000, jump: 0, delays: [] as number[], fileOps: [] as string[], renameFailure: undefined as Error | undefined, renameSuffix: '', statFailure: undefined as Error | undefined }))
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>()
  return { ...real, existsSync: (file: string) => file === '/synthetic/chromium' || (!file.startsWith('/usr/') && !file.startsWith('/opt/') && real.existsSync(file)),
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
vi.mock('node:timers/promises', async (original) => {
  const real = await original<typeof import('node:timers/promises')>()
  return { ...real, setTimeout: async (ms: number, _value: undefined, options: { signal: AbortSignal }) => {
    seams.delays.push(ms)
    seams.now += seams.jump || ms
    await real.setTimeout(1)
    options.signal.throwIfAborted()
  } }
})

const url = 'https://fansly.com/example'
const ownerUrl = 'https://apiv3.fansly.com/api/v1/account?usernames=example'
const feedUrl = 'https://apiv3.fansly.com/api/v1/timeline/7'
const mediaUrl = 'https://cdn.fansly.com/files/one.jpg?Signature=synthetic'
const roots: string[] = []
const owners: OnlyFansProfiles[] = []
const payload = () => ({ response: { posts: [{ id: '100', attachments: [{ contentId: '1' }] }], accountMedia: [{ id: '1', access: true, media: { mimetype: 'image/jpeg', locations: [{ location: mediaUrl }] } }], hasMore: false } })
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
    waitForResponse: vi.fn(async (_predicate?: unknown, _options?: unknown) => response('https://apiv3.fansly.com/api/v1/post?ids=100', payload())),
    getByText: vi.fn(() => ({ all: vi.fn(async () => covers) })),
    locator: vi.fn(() => ({ first: () => ({ getAttribute: async () => null }) }))
  }
  seams.launch.mockResolvedValue(context)
  const profiles = new FanslyProfiles(directory, () => directory)
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


const host = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async (original) => { const real = await original<typeof import('node:child_process')>(); return { ...real, spawn: host.spawn, spawnSync: () => ({ stdout: '/synthetic/chromium' }) } })
it('maps Fansly responses without cookies, enqueues adapter task and downloads via its executor', async () => {
  const f = setup(); const modes: unknown[] = []
  f.page.evaluate.mockImplementation(async (...args: unknown[]) => { modes.push(args[1]); return false })
  f.page.goto.mockImplementation(async () => {
    f.events.emit('response', response(ownerUrl, { response: [{ id: '7', username: 'example' }] }))
    f.events.emit('response', response(feedUrl, payload()))
  })
  await f.profiles.command({ url, action: 'map' }); const mapped = await settled(f)
  expect(mapped).toEqual({ username: 'example', profileUrl: url, state: 'complete', updatedAt: seams.now, pages: 1, category: 'media', error: undefined, items: [{ id: '1', postId: '100', category: 'photos', state: 'available', downloaded: false }] })
  expect(JSON.parse(readFileSync(f.filename, 'utf8'))).toEqual(JSON.parse(JSON.stringify(mapped)))
  expect(f.context.cookies).not.toHaveBeenCalled()
  expect(modes).toContainEqual({ nested: true, chat: false })
  expect(seams.launch.mock.calls).toEqual([[path.join(f.directory, 'browser-session'), { executablePath: '/synthetic/chromium', headless: false, viewport: null, ignoreDefaultArgs: ['--enable-automation'], args: ['--no-first-run'] }]])
  const queue = new TaskQueueAPI({ executor: { run: vi.fn() }, persist: new MemoryPersistAdapter() })
  const add = vi.spyOn(queue, 'add'); const group = vi.spyOn(queue, 'setMaxPerGroup')
  await expect(f.profiles.enqueue(queue, { url, itemIds: ['1'], customDownloadPath: '/fixture/downloads' })).resolves.toEqual({ count: 1 })
  expect(group.mock.calls).toEqual([['fansly-browser', 1]])
  expect(add.mock.calls).toEqual([[{ id: `fansly_example_1_${createHash('sha256').update('/fixture/downloads').digest('hex').slice(0, 16)}`, priority: 0, groupKey: 'fansly-browser', input: { kind: 'social-media', url: `${url}/posts`, title: '@example · photos · 1', options: { onlyFansProfile: url, onlyFansMediaId: '1', customDownloadPath: '/fixture/downloads' } } }]])
  const fetchMedia = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg', 'content-length': '3' } })); vi.stubGlobal('fetch', fetchMedia)
  const callbacks = { onSpawn: vi.fn(), onStd: vi.fn(), onProgress: vi.fn(), onFinish: vi.fn() }
  const fallback = { run: vi.fn() }
  new OnlyFansBrowserExecutor(f.profiles, fallback, () => f.directory).run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url, options: { onlyFansProfile: url, onlyFansMediaId: '1' } } }, callbacks)
  await vi.waitFor(() => expect(callbacks.onFinish).toHaveBeenCalledOnce())
  expect(callbacks.onFinish.mock.calls).toEqual([[{ taskId: 'task', attemptId: 'attempt', closedAt: seams.now, stdoutTail: '', stderrTail: '', result: { type: 'success', output: { filePath: path.join(f.directory, 'Fansly/example/photos/100_1.jpg'), size: 3, durationMs: null, sha256: null } } }]])
  expect(fetchMedia.mock.calls).toEqual([[mediaUrl, { headers: { Referer: 'https://fansly.com/' }, redirect: 'error', signal: expect.any(AbortSignal) }]])
  expect(fallback.run).not.toHaveBeenCalled(); await queue.stop()
}, 20000)

it.each(['spawn', 'error'])('pins Fansly dedicated login %s and reuse/map exclusion', async (event) => {
  const f = setup(); const child = new ChildProcess()
  host.spawn.mockReturnValue(child)
  const opening = f.profiles.command({ url, action: 'open' })
  await turns()
  expect(host.spawn.mock.calls).toEqual([['/synthetic/chromium', [`--user-data-dir=${f.directory}/browser-session`, '--no-first-run', url], { stdio: 'ignore' }]])
  expect(child.listenerCount('spawn')).toBe(1); expect(child.listenerCount('error')).toBe(1)
  const failure = new Error('login spawn failed')
  const rejected = event === 'error' ? expect(opening).rejects.toBe(failure) : undefined
  child.emit(event, ...(event === 'error' ? [failure] : []))
  if (rejected) await rejected
  else {
    await opening
    expect(child.listenerCount('spawn')).toBe(0); expect(child.listenerCount('error')).toBe(1)
    await f.profiles.command({ url, action: 'open' }); expect(host.spawn).toHaveBeenCalledOnce()
    await f.profiles.command({ url, action: 'map' }); const result = await settled(f)
    expect(result.state).toBe('error'); expect(result.error).toBe('Close the dedicated login window after signing in, then map the profile.')
  }
}, 15000)
it('closes the automation context before opening the dedicated Fansly login child', async () => {
  const f = setup()
  f.page.goto.mockImplementation(async () => { f.events.emit('response', response(ownerUrl, { response: [{ id: '7', username: 'example' }] })); f.events.emit('response', response(feedUrl, payload())) })
  await f.profiles.command({ url, action: 'map' }); await settled(f)
  const child = new ChildProcess(); host.spawn.mockReturnValue(child)
  const opening = f.profiles.command({ url, action: 'open' }); await turns()
  expect(f.context.close).toHaveBeenCalledOnce()
  expect(f.context.close.mock.invocationCallOrder[0]).toBeLessThan(host.spawn.mock.invocationCallOrder[0]!)
  child.emit('spawn'); await opening
}, 15000)
