import { virtualError, TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OnlyFansBrowserExecutor, OnlyFansProfiles } from '@vidbee/browser-capture-legacy/onlyfans-profile'
import { FanslyProfiles } from '@vidbee/browser-capture-legacy/fansly-profile'
import { onlyFansChatRoutes, onlyFansChatUrl, onlyFansPurchasedRoutes, onlyFansPurchasedUrl, onlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'
import { afterEach, describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'

const browser = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('playwright-core', () => ({ chromium: { launchPersistentContext: browser.launch } }))

const url = 'https://onlyfans.com/example'
const signedUrl = 'https://cdn2.onlyfans.com/files/photo.jpg?Signature=synthetic'
const directories: string[] = []
const owners: OnlyFansProfiles[] = []
const lengthCases = [
  { label: 'finite', header: '3', total: 3, succeeds: true },
  { label: 'exponent overflow', header: '1e999', total: Infinity, succeeds: false },
  { label: 'decimal overflow', header: '9'.repeat(400), total: Infinity, succeeds: false },
  { label: 'zero', header: '0', total: 0, succeeds: true },
  { label: 'missing', header: null, total: 0, succeeds: true },
  { label: 'malformed', header: 'invalid', total: 0, succeeds: true },
  { label: 'negative finite', header: '-3', total: -3, succeeds: false },
  { label: 'negative overflow', header: '-1e999', total: -Infinity, succeeds: false },
  { label: 'finite mismatch', header: '4', total: 4, succeeds: false }
]

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'vidbee-profile-characterization-'))
  directories.push(directory)
  return directory
}

function inventory() {
  return {
    username: 'example', profileUrl: url, state: 'complete', updatedAt: 1, pages: 2,
    items: [{ id: '1', postId: '100', category: 'photos', state: 'available', downloaded: false }]
  }
}

function setup() {
  const directory = temporaryDirectory()
  const filename = path.join(directory, 'example.json')
  writeFileSync(filename, JSON.stringify(inventory()))
  const response = {
    url: () => 'https://onlyfans.com/api2/v2/posts/100', ok: () => true, status: () => 200,
    json: async () => ({ id: 100, media: [{ id: 1, type: 'photo', files: { full: { url: signedUrl } } }] })
  }
  const page = {
    isClosed: () => false,
    waitForResponse: vi.fn(async () => response),
    goto: vi.fn(async () => undefined),
    bringToFront: vi.fn(async () => undefined),
    url: () => url,
    evaluate: vi.fn(async () => ({ width: 1920, height: 1080 })),
    getByText: vi.fn(() => ({ all: async () => [] }))
  }
  const context = { pages: () => [page], on: vi.fn(), close: vi.fn(async () => undefined) }
  browser.launch.mockResolvedValue(context)
  const profiles = new OnlyFansProfiles(directory, () => directory)
  owners.push(profiles)
  const target = path.join(directory, 'OnlyFans', 'example', 'photos', '100_1.jpg')
  return { directory, filename, target, profiles, page, context }
}

function suppliedResponse(header: string | null, chunks = [new Uint8Array([1]), new Uint8Array([2, 3])]) {
  const headers = new Headers({ 'content-type': 'image/jpeg' })
  if (header !== null) headers.set('content-length', header)
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    }
  }), { headers })
}

function events() {
  return { onSpawn: vi.fn(), onProgress: vi.fn(), onStd: vi.fn(), onFinish: vi.fn() }
}

function executionContext() {
  return {
    taskId: 'profile-task', attemptId: 'profile-attempt', attemptNumber: 1,
    input: { url, kind: 'video' as const, options: { onlyFansProfile: url, onlyFansMediaId: '1' } }
  }
}

afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.stop()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})


const waitFinished = async (callbacks: ReturnType<typeof events>, count = 1) => vi.waitFor(() => expect(callbacks.onFinish).toHaveBeenCalledTimes(count), { timeout: 5000 })
const finished = (result: unknown) => ({ taskId: 'profile-task', attemptId: 'profile-attempt', closedAt: 1234, stdoutTail: '', stderrTail: '', result })

it('delegates synchronously with context/events identity and returns the fallback control', () => {
  const fixture = setup(); const callbacks = events(); const sentinel = { cancel: vi.fn(), pause: vi.fn() }; const fallback = { run: vi.fn((_context: unknown, _events: unknown) => sentinel) }
  const context = { ...executionContext(), input: { kind: 'video' as const, url: 'https://fixture.invalid/video' } }
  expect(new OnlyFansBrowserExecutor(fixture.profiles, fallback, () => fixture.directory).run(context, callbacks)).toBe(sentinel)
  expect(fallback.run.mock.calls).toEqual([[context, callbacks]])
  expect(fallback.run.mock.calls[0]?.[0]).toBe(context); expect(fallback.run.mock.calls[0]?.[1]).toBe(callbacks)
  expect(callbacks.onSpawn).not.toHaveBeenCalled()
})

it.each([undefined, { onlyFansProfile: url }])('pins missing options error %#', async (options) => {
  const fixture = setup(); vi.spyOn(Date, 'now').mockReturnValue(1234)
  const callbacks = events(); const context = { ...executionContext(), input: { kind: 'video' as const, url, options } }
  new OnlyFansBrowserExecutor(fixture.profiles, { run: vi.fn() }, () => fixture.directory).run(context, callbacks)
  expect(callbacks.onFinish).not.toHaveBeenCalled(); await waitFinished(callbacks)
  expect(callbacks.onFinish.mock.calls).toEqual([[finished({ type: 'error', error: virtualError('auth-required', 'Open this OnlyFans profile in VidBeep and map it using the dedicated browser session.'), exitCode: null })]])
})

it('pins custom destination, manifest bytes/mode and complete social-media output', async () => {
  const fixture = setup(); vi.spyOn(Date, 'now').mockReturnValue(1234); vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse('3')))
  const callbacks = events(); const context = executionContext(); const directory = path.join(fixture.directory, 'custom')
  const input = { ...context.input, kind: 'social-media' as const, options: { ...context.input.options, customDownloadPath: directory } }
  new OnlyFansBrowserExecutor(fixture.profiles, { run: vi.fn() }, () => { throw new Error('default directory must not be consulted') }).run({ ...context, input }, callbacks)
  await waitFinished(callbacks)
  const filePath = path.join(directory, 'OnlyFans/example/photos/100_1.jpg'); const manifestPath = `${filePath}.manifest.json`
  const summary = { posts: 1, images: 1, videos: 0, downloaded: 1, existing: 0, failed: 0, totalSize: 3, reason: 'exhausted', manifestPath, startedAt: 1234, finishedAt: 1234 }
  expect(readFileSync(manifestPath, 'utf8')).toBe(JSON.stringify({ files: [filePath], ...summary }))
  expect(statSync(manifestPath).mode & 0o777).toBe(0o600)
  expect(callbacks.onFinish.mock.calls).toEqual([[finished({ type: 'success', output: { filePath, size: 3, durationMs: null, sha256: null, outputDirectory: path.dirname(filePath), fileCount: 1, collectionSummary: summary } })]])
}, 15000)

it('attempts a second error finish after the success callback throws', async () => {
  const fixture = setup(); vi.spyOn(Date, 'now').mockReturnValue(1234); vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse('3')))
  const callbacks = events(); callbacks.onFinish.mockImplementationOnce(() => { throw new Error('finish callback failed') })
  new OnlyFansBrowserExecutor(fixture.profiles, { run: vi.fn() }, () => fixture.directory).run(executionContext(), callbacks)
  await waitFinished(callbacks, 2)
  expect(callbacks.onFinish.mock.calls).toEqual([
    [finished({ type: 'success', output: { filePath: fixture.target, size: 3, durationMs: null, sha256: null } })],
    [finished({ type: 'error', error: virtualError('auth-required', 'finish callback failed'), exitCode: null })]
  ])
}, 15000)

it('cancels a held transfer with one cancelled finish and retained partial output', async () => {
  const fixture = setup(); vi.spyOn(Date, 'now').mockReturnValue(1234)
  let body!: ReadableStreamDefaultController<Uint8Array>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; controller.enqueue(new Uint8Array([1])) } }), { headers: { 'content-type': 'image/jpeg' } })))
  const callbacks = events(); const run = new OnlyFansBrowserExecutor(fixture.profiles, { run: vi.fn() }, () => fixture.directory).run(executionContext(), callbacks)
  await vi.waitFor(() => expect(callbacks.onProgress).toHaveBeenCalled(), { timeout: 5000 })
  const cancelling = run.cancel(); body.close(); await cancelling
  expect(callbacks.onFinish.mock.calls).toEqual([[finished({ type: 'cancelled' })]])
  expect(existsSync(fixture.target)).toBe(false); expect(existsSync(`${fixture.target}.part`)).toBe(true)
}, 15000)

it.each(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'm4v', 'JPG', 'm3u8'])('pins original extension %s and timeout', async (extension) => {
  const fixture = setup(); const media = `https://cdn2.onlyfans.com/files/X.${extension}`
  fixture.page.waitForResponse.mockResolvedValue({ url: () => 'https://onlyfans.com/api2/v2/posts/100', ok: () => true, status: () => 200, json: async () => ({ id: 100, media: [{ id: 1, type: 'photo', files: { full: { url: media } } }] }) })
  const fetchMedia = vi.fn(async () => suppliedResponse('3')); vi.stubGlobal('fetch', fetchMedia)
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  const download = fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())
  if (extension === 'm3u8') { await expect(download).rejects.toThrow('Unsupported original media format.'); expect(fetchMedia).not.toHaveBeenCalled(); expect(timeout).not.toHaveBeenCalled() }
  else {
    await expect(download).resolves.toEqual({ filePath: fixture.target.replace(/jpg$/, extension.toLowerCase()), size: 3 })
    expect(timeout.mock.calls).toEqual([[1800000]])
  }
}, 15000)

it('pins schema validation class and issue paths for saved data and commands', async () => {
  const fixture = setup(); const brokenDir = temporaryDirectory(); writeFileSync(path.join(brokenDir, 'example.json'), JSON.stringify({ ...inventory(), pages: 'wrong' }))
  const invalid = new OnlyFansProfiles(brokenDir, () => brokenDir); owners.push(invalid)
  try { invalid.get(url); throw new Error('expected schema failure') } catch (error) { expect(error).toMatchObject({ name: 'ZodError', issues: [expect.objectContaining({ path: ['pages'], code: 'invalid_type' })] }) }
  await expect(Reflect.apply(fixture.profiles.command, fixture.profiles, [{ url, action: 'bogus' }])).rejects.toMatchObject({ name: 'ZodError', issues: [expect.objectContaining({ path: ['action'] })] })
  const queue = new TaskQueueAPI({ executor: { run: vi.fn() }, persist: new MemoryPersistAdapter() })
  for (const itemIds of [[], 'abc', Array.from({ length: 10001 }, () => '1')]) await expect(Reflect.apply(fixture.profiles.enqueue, fixture.profiles, [queue, { url, itemIds }])).rejects.toMatchObject({ name: 'ZodError', issues: [expect.objectContaining({ path: ['itemIds'] })] })
}, 15000)

vi.mock('node:child_process', async (original) => { const real = await original<typeof import('node:child_process')>(); return { ...real, spawnSync: (...args: Parameters<typeof real.spawnSync>) => args[0] === 'which' ? { stdout: '/synthetic/chromium' } : real.spawnSync(...args) } })
vi.mock('node:fs', async (original) => { const real = await original<typeof import('node:fs')>(); return { ...real, existsSync: (file: string) => file === '/synthetic/chromium' || (!file.startsWith('/usr/') && !file.startsWith('/opt/') && real.existsSync(file)) } })
