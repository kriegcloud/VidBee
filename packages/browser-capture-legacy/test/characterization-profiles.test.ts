import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OnlyFansBrowserExecutor, OnlyFansProfiles } from '@vidbee/browser-capture-legacy/onlyfans-profile'
import { virtualError } from '@vidbee/task-queue-legacy'
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

describe('profile transfer characterization through public entries', () => {
  it.each(lengthCases)('preserves $label length coercion, progress and final-file policy', async ({ header, total, succeeds }) => {
    const fixture = setup()
    mkdirSync(path.dirname(fixture.target), { recursive: true })
    writeFileSync(fixture.target, 'existing-final')
    const fetchMedia = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => suppliedResponse(header))
    vi.stubGlobal('fetch', fetchMedia)
    const progress = vi.fn((bytes: number, _total: number) => {
      if (bytes === 1) {
        expect(existsSync(`${fixture.target}.part`) ? statSync(`${fixture.target}.part`).size : 0).toBe(0)
      }
    })
    const signal = new AbortController().signal
    const result = fixture.profiles.download(url, '1', fixture.directory, signal, progress)
    if (succeeds) {
      await expect(result).resolves.toEqual({ filePath: fixture.target, size: 3 })
      expect(readFileSync(fixture.target)).toEqual(Buffer.from([1, 2, 3]))
      expect(existsSync(`${fixture.target}.part`)).toBe(false)
    } else {
      await expect(result).rejects.toThrow('The downloaded file is incomplete.')
      expect(readFileSync(`${fixture.target}.part`)).toEqual(Buffer.from([1, 2, 3]))
      expect(readFileSync(fixture.target, 'utf8')).toBe('existing-final')
    }
    expect(progress.mock.calls).toEqual([[1, total], [3, total]])
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(succeeds)
    expect(JSON.parse(readFileSync(fixture.filename, 'utf8')).items[0].downloaded).toBe(succeeds)
    expect(readFileSync(fixture.filename, 'utf8')).not.toContain('Signature')
    expect(fixture.page.waitForResponse).toHaveBeenCalledWith(expect.any(Function), { timeout: 8000 })
    expect(fixture.page.goto).toHaveBeenCalledWith('https://onlyfans.com/100/example', {
      waitUntil: 'domcontentloaded', timeout: 45_000
    })
    expect(fetchMedia).toHaveBeenCalledOnce()
    expect(fetchMedia.mock.calls[0]).toEqual([signedUrl, {
      headers: { Referer: 'https://onlyfans.com/' }, redirect: 'error', signal: expect.any(AbortSignal)
    }])
    expect(fetchMedia.mock.calls[0]?.[1]?.signal).not.toBe(signal)
    if (!succeeds) {
      vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse('3')))
      await expect(fixture.profiles.download(url, '1', fixture.directory, signal, vi.fn())).resolves.toEqual({ filePath: fixture.target, size: 3 })
    }
  }, 15_000)

  it.each(lengthCases)('projects $label totals through the executor after its first microtask', async ({ header, total, succeeds }) => {
    const fixture = setup()
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse(header)))
    const callbacks = events()
    const executor = new OnlyFansBrowserExecutor(fixture.profiles, { run: vi.fn() }, () => fixture.directory)
    const control = executor.run(executionContext(), callbacks)
    expect(callbacks.onSpawn).not.toHaveBeenCalled()
    expect(callbacks.onProgress).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(callbacks.onSpawn.mock.calls).toEqual([[{
      taskId: 'profile-task', attemptId: 'profile-attempt', pid: process.pid,
      pidStartedAt: 1234, kind: 'ai-worker', spawnedAt: 1234
    }]])
    await vi.waitFor(() => expect(callbacks.onFinish).toHaveBeenCalledOnce(), { timeout: 5000 })
    expect(callbacks.onProgress.mock.calls).toEqual([1, 3].map((bytes) => [{
      taskId: 'profile-task', attemptId: 'profile-attempt', enteredProcessing: false,
      progress: { percent: total ? bytes / total : null, bytesDownloaded: bytes,
        bytesTotal: total || null, speedBps: null, etaMs: null, ticks: 1234 }
    }]))
    if (total === -Infinity) expect(Object.is(callbacks.onProgress.mock.calls[1]?.[0].progress.percent, -0)).toBe(true)
    const finish = callbacks.onFinish.mock.calls[0]?.[0]
    expect(finish).toEqual({ taskId: 'profile-task', attemptId: 'profile-attempt', closedAt: 1234, stdoutTail: '', stderrTail: '', result: succeeds ? { type: 'success', output: { filePath: fixture.target, size: 3, durationMs: null, sha256: null } } : { type: 'error', error: virtualError('auth-required', 'The downloaded file is incomplete.'), exitCode: null } })
    if (succeeds) expect(finish.result).toEqual({ type: 'success', output: { filePath: fixture.target, size: 3, durationMs: null, sha256: null } })
    else expect(finish.result).toEqual({ type: 'error', exitCode: null, error: virtualError('auth-required', 'The downloaded file is incomplete.') })
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(succeeds)
    expect(existsSync(`${fixture.target}.part`)).toBe(!succeeds)
    await control.cancel()
    await control.pause()
    expect(callbacks.onFinish).toHaveBeenCalledOnce()
  }, 15_000)

  it.each([null, '0', 'invalid'])('rejects an empty body with length %s after creating the partial file', async (header) => {
    const fixture = setup()
    vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse(header, [])))
    const progress = vi.fn()
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, progress)).rejects.toThrow('The downloaded file is incomplete.')
    expect(progress).not.toHaveBeenCalled()
    expect(statSync(`${fixture.target}.part`).size).toBe(0)
    expect(existsSync(fixture.target)).toBe(false)
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(false)
  }, 15_000)

  it.each([
    { status: 403, body: 'denied', mime: 'image/jpeg', error: 'OnlyFans media download failed (HTTP 403). Remap and retry.' },
    { status: 200, body: '<html>login</html>', mime: 'text/html', error: 'The server returned a page instead of a media file.' },
    { status: 204, body: null, mime: 'image/jpeg', error: 'OnlyFans media download failed (HTTP 204). Remap and retry.' }
  ])('rejects transport metadata status $status MIME $mime before creating partial output', async ({ status, body, mime, error }) => {
    const fixture = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': mime } })))
    const progress = vi.fn()
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, progress)).rejects.toThrow(error)
    expect(progress).not.toHaveBeenCalled()
    expect(existsSync(`${fixture.target}.part`)).toBe(false)
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(false)
  }, 15_000)

  it('preserves preabort identity before launching a browser and fetch rejection identity after refresh', async () => {
    const fixture = setup()
    const controller = new AbortController()
    const reason = new Error('synthetic abort')
    controller.abort(reason)
    await expect(fixture.profiles.download(url, '1', fixture.directory, controller.signal, vi.fn())).rejects.toBe(reason)
    expect(browser.launch).not.toHaveBeenCalled()
    const fetchError = new Error('synthetic fetch rejection')
    vi.stubGlobal('fetch', vi.fn(async () => { throw fetchError }))
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toBe(fetchError)
    expect(existsSync(`${fixture.target}.part`)).toBe(false)
  }, 15_000)

  it('propagates writer failure without marking downloaded and allows a later transfer', async () => {
    const fixture = setup()
    mkdirSync(`${fixture.target}.part`, { recursive: true })
    vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse('3')))
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toThrow()
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(false)
    expect(existsSync(fixture.target)).toBe(false)
    rmSync(`${fixture.target}.part`, { recursive: true })
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).resolves.toEqual({ filePath: fixture.target, size: 3 })
  }, 15_000)

  it('retains callback failure identity, releases admission and leaves the first chunk unwritten', async () => {
    const fixture = setup()
    vi.stubGlobal('fetch', vi.fn(async () => suppliedResponse('3')))
    const failure = new Error('synthetic progress failure')
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, () => { throw failure })).rejects.toBe(failure)
    expect(existsSync(fixture.target)).toBe(false)
    expect(statSync(`${fixture.target}.part`).size).toBe(0)
    expect(fixture.profiles.get(url).items[0].downloaded).toBe(false)
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).resolves.toEqual({ filePath: fixture.target, size: 3 })
  }, 15_000)

  it('rejects concurrent download/open admission while allowing get and stop without aborting the transfer', async () => {
    const fixture = setup()
    let finishBody: (() => void) | undefined
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      finishBody = () => controller.close()
    } }), { headers: { 'content-type': 'image/jpeg' } })))
    const progress = vi.fn()
    const download = fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, progress)
    await vi.waitFor(() => expect(progress).toHaveBeenCalledOnce(), { timeout: 5000 })
    await expect(fixture.profiles.download(url, '1', fixture.directory, new AbortController().signal, vi.fn())).rejects.toThrow('Finish or stop OnlyFans mapping before downloading.')
    await expect(fixture.profiles.command({ url, action: 'open' })).rejects.toThrow('Another OnlyFans operation is running. Stop it or wait for it to finish.')
    await expect(fixture.profiles.command({ url, action: 'get' })).resolves.toMatchObject({ state: 'complete' })
    await fixture.profiles.stop()
    expect(fixture.context.close).toHaveBeenCalledOnce()
    finishBody?.()
    await expect(download).resolves.toEqual({ filePath: fixture.target, size: 3 })
  }, 15_000)
})

describe('profile persistence characterization through public entries', () => {
  it('strips nested extras, supplies downloaded defaults, recovers mapping and returns deep clones', () => {
    const fixture = setup()
    writeFileSync(fixture.filename, JSON.stringify({ ...inventory(), state: 'mapping', extra: 'discard', items: [{ ...inventory().items[0], downloaded: undefined, extra: 'discard' }] }))
    const first = fixture.profiles.get(url)
    expect(first).toEqual({ ...inventory(), state: 'partial' })
    first.items[0].downloaded = true
    first.items.push({ ...first.items[0], id: '2' })
    first.state = 'error'
    expect(fixture.profiles.get(url)).toEqual({ ...inventory(), state: 'partial' })
    writeFileSync(fixture.filename, 'corrupt after cache')
    expect(fixture.profiles.get(url)).toEqual({ ...inventory(), state: 'partial' })
    expect(fixture.profiles.list()).toEqual([])
    expect(readFileSync(fixture.filename, 'utf8')).toBe('corrupt after cache')
  }, 10_000)

  it('keeps unsaved gets absent from list and distinguishes synchronous errors from rejected commands', async () => {
    const directory = temporaryDirectory()
    const profiles = new OnlyFansProfiles(path.join(directory, 'absent'), () => directory)
    owners.push(profiles)
    expect(profiles.get(url)).toMatchObject({ username: 'example', state: 'idle', pages: 0, items: [] })
    expect(profiles.list()).toEqual([])
    expect(existsSync(path.join(directory, 'absent'))).toBe(false)
    expect(() => profiles.get('https://example.invalid/')).toThrow('Enter a OnlyFans profile URL.')
    let pending: Promise<unknown> | undefined
    expect(() => { pending = profiles.command({ url: 'https://example.invalid/', action: 'get' }) }).not.toThrow()
    await expect(pending).rejects.toThrow('Enter a OnlyFans profile URL.')
  }, 10_000)

  it.each(['{broken', '\ufeff{}', JSON.stringify({ ...inventory(), pages: 'wrong' })])('propagates unreadable get data while list omits it', (content) => {
    const fixture = setup()
    writeFileSync(fixture.filename, content)
    expect(() => fixture.profiles.get(url)).toThrow()
    expect(fixture.profiles.list()).toEqual([])
  }, 10_000)

  it('enforces saved identity and preserves list filename filtering and alias duplicates', () => {
    const fixture = setup()
    writeFileSync(fixture.filename, JSON.stringify({ ...inventory(), username: 'other' }))
    expect(() => fixture.profiles.get(url)).toThrow('Saved profile identity does not match.')
    expect(fixture.profiles.list()).toEqual([])
    writeFileSync(fixture.filename, JSON.stringify(inventory()))
    writeFileSync(path.join(fixture.directory, 'alias.json'), JSON.stringify(inventory()))
    writeFileSync(path.join(fixture.directory, 'UPPER.json'), JSON.stringify({ ...inventory(), profileUrl: 'https://onlyfans.com/upper', username: 'upper' }))
    const listed = fixture.profiles.list()
    expect(listed).toEqual([inventory(), inventory()])
    expect(listed[0]).not.toBe(listed[1])
    expect(listed[0]?.items[0]).not.toBe(listed[1]?.items[0])
  }, 10_000)

  it.each([
    ...onlyFansChatRoutes.map((route) => ({ route: `chat ${route}`, profileUrl: onlyFansChatUrl('7', route), key: route === 'messages' ? '7' : `7-${route}` })),
    ...onlyFansPurchasedRoutes.map((route) => ({ route: `purchased ${route}`, profileUrl: onlyFansPurchasedUrl('7', route), key: `purchased-7-${route}` }))
  ])('loads and saves the exact $route identity and filename', async ({ profileUrl, key }) => {
    const fixture = setup()
    const identity = onlyFansProfile(profileUrl)
    expect(identity).not.toBeNull()
    const saved = { ...inventory(), ...identity, profileUrl, state: 'mapping' }
    const filename = path.join(fixture.directory, `${key}.json`)
    writeFileSync(filename, JSON.stringify(saved))
    expect(fixture.profiles.get(profileUrl)).toEqual({ ...saved, state: 'partial' })
    await fixture.profiles.command({ url: profileUrl, action: 'open' })
    const persisted = JSON.parse(readFileSync(filename, 'utf8'))
    expect(persisted).toMatchObject({ ...identity, state: 'partial' })
    expect(readFileSync(filename, 'utf8').endsWith('\n')).toBe(false)
    expect(existsSync(`${filename}.tmp`)).toBe(false)
    expect(statSync(filename).mode & 0o777).toBe(0o600)
    const reloaded = new OnlyFansProfiles(fixture.directory, () => fixture.directory)
    owners.push(reloaded)
    expect(reloaded.get(profileUrl)).toEqual(persisted)
  }, 15_000)

  it.each([
    { username: 'other' }, { profileUrl: 'https://onlyfans.com/other' },
    { chatId: '7' }, { chatRoute: 'gallery' }, { purchasedUserId: '7' }, { purchasedRoute: 'photos' }
  ])('checks every saved identity component: %j', (changed) => {
    const fixture = setup()
    writeFileSync(fixture.filename, JSON.stringify({ ...inventory(), ...changed }))
    expect(() => fixture.profiles.get(url)).toThrow('Saved profile identity does not match.')
  }, 10_000)

  it('retains Fansly inheritance and adapter identity while using its own persistence origin', () => {
    const directory = temporaryDirectory()
    const profiles = new FanslyProfiles(directory, () => directory)
    owners.push(profiles)
    expect(profiles).toBeInstanceOf(OnlyFansProfiles)
    expect(profiles.adapter.key).toBe('fansly')
    expect(profiles.get('https://fansly.com/Example')).toMatchObject({ username: 'example', profileUrl: 'https://fansly.com/example', state: 'idle' })
    expect(() => profiles.get(url)).toThrow('Enter a Fansly profile URL.')
  }, 10_000)
})

vi.mock('node:child_process', async (original) => { const real = await original<typeof import('node:child_process')>(); return { ...real, spawnSync: (...args: Parameters<typeof real.spawnSync>) => args[0] === 'which' ? { stdout: '/synthetic/chromium' } : real.spawnSync(...args) } })
vi.mock('node:fs', async (original) => { const real = await original<typeof import('node:fs')>(); return { ...real, existsSync: (file: string) => file === '/synthetic/chromium' || (!file.startsWith('/usr/') && !file.startsWith('/opt/') && real.existsSync(file)) } })
