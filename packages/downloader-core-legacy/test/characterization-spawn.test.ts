import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ calls: [] as unknown[][], statGate: undefined as Promise<void> | undefined, gatePath: '', children: [] as Array<EventEmitter & { pid: number; stdout: PassThrough; stderr: PassThrough }> }))
vi.mock('node:child_process', async (original) => {
  const real = await original<typeof import('node:child_process')>()
  return { ...real, spawn: (...args: unknown[]) => {
    mock.calls.push(args)
    const child = Object.assign(new EventEmitter(), { pid: 424242, stdout: new PassThrough(), stderr: new PassThrough() })
    mock.children.push(child); return child
  } }
})
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return { ...real, stat: async (...args: Parameters<typeof real.stat>) => { if (String(args[0]) === mock.gatePath) await mock.statGate; return real.stat(...args) } }
})
import { InstagramProfileInspector } from '@vidbee/downloader-core-legacy'
import { SocialProfileManager } from '@vidbee/downloader-core-legacy/social-profile-manager'
const roots: string[] = []
function root() { const dir = mkdtempSync(join(tmpdir(), 'vidbee-fake-spawn-')); roots.push(dir); return dir }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); mock.calls = []; mock.children = []; mock.statGate = undefined; mock.gatePath = ''; for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }) })
async function turns() { for (let i = 0; i < 30; i++) await Promise.resolve() }
function mapper() { return new SocialProfileManager({ storageDir: root(), runtime: { resolveBinaryPath: () => '/fixture/gallery' }, resolveYtDlpPath: () => '/fixture/ytdlp' }) }
const url = 'https://www.pinterest.com/fixture/_created/'
function child() { const value = mock.children.at(-1); if (!value) throw new Error('no child'); return value }

it('generic mapper explicit spawn options, timeout requests group KILL and keeps diagnostic', async () => {
  vi.useFakeTimers(); const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  const api = mapper(); api.map(url, 'posts'); await turns()
  expect(mock.calls[0]?.[2]).toEqual({ stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true })
  vi.advanceTimersByTime(600000); expect(kill).toHaveBeenCalledWith(-424242, 'SIGKILL')
  child().emit('close', null); await turns()
  expect(api.get(url).categories.posts?.state).toBe('partial')
  expect(api.get(url).categories.posts?.error).toBe('Pinterest mapping timed out.')
})
it('generic mapper character-count cap, stderr 4096 tail and final carry handling', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true); const api = mapper(); api.map(url, 'posts'); await turns()
  child().stdout?.emit('data', Buffer.from(JSON.stringify([3, 'https://cdn.invalid/file', { id: '123', extension: 'jpg' }])))
  child().stderr?.emit('data', Buffer.from('x'.repeat(5000)))
  child().emit('close', 7); await turns()
  expect(api.get(url).categories.posts?.items[0]?.id).toBe('123')
  expect(api.get(url).categories.posts?.error).toBe('x'.repeat(4096)); expect(kill).not.toHaveBeenCalled()
})
it('generic mapper retains the prefix, rejects chunk beyond 32Mi characters, swallows signalling failure', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('gone') }); const api = mapper(); api.map(url, 'posts'); await turns()
  child().stdout?.emit('data', Buffer.from('x'.repeat(32 * 1024 * 1024 + 1))); expect(kill).toHaveBeenCalledWith(-424242, 'SIGKILL')
  child().emit('close', null); await turns()
  expect(api.get(url).categories.posts?.error).toBe('Pinterest mapping exceeded its output limit.')
})
it('Instagram explicit inspection argv and options; timeout retains parse failure', async () => {
  vi.useFakeTimers(); const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  const api = new InstagramProfileInspector({ resolveBinaryPath: () => '/fixture/gallery', resolveExtraArgs: () => ['--proxy', 'http://proxy.invalid'], clock: () => 1000 })
  const pending = api.inspect('https://instagram.com/fixture', undefined, ['posts']); await turns()
  expect(mock.calls[0]).toMatchSnapshot()
  vi.advanceTimersByTime(600000); expect(kill).toHaveBeenCalledWith(-424242, 'SIGKILL')
  child().stdout?.emit('data', Buffer.from('[]')); child().emit('close', null)
  const result = await pending; expect(result.categories.find((c) => c.category === 'posts')).toMatchSnapshot()
})
it('Instagram stdout cap counts bytes and oversized unterminated stderr carry stops child', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  const api = new InstagramProfileInspector({ resolveBinaryPath: () => '/fixture/gallery' })
  const pending = api.inspect('https://instagram.com/fixture', undefined, ['posts']); await turns()
  child().stdout?.emit('data', Buffer.alloc(64 * 1024 * 1024 + 1, 0x78)); expect(kill).toHaveBeenCalledTimes(1)
  child().stderr?.emit('data', Buffer.from('x'.repeat(1024 * 1024 + 1))); expect(kill).toHaveBeenCalledTimes(2)
  child().emit('close', null); const value = await pending
  expect(value.categories.find((c) => c.category === 'posts')?.state).toBe('unavailable')
})
it('Instagram checkpoint is visible before close; duplicate caller promises differ; cancellation has synchronous prefix', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  const api = new InstagramProfileInspector({ resolveBinaryPath: () => '/fixture/gallery', clock: () => 1000 })
  const first = api.inspect('https://instagram.com/fixture', undefined, ['posts']); const duplicate = api.inspect('https://instagram.com/fixture', undefined, ['posts'])
  expect(first).not.toBe(duplicate); await turns()
  const id = api.list()[0]?.inspectionId; expect(id).toBeDefined()
  child().stderr?.emit('data', Buffer.from(`VIDBEE_MAP:${JSON.stringify([3, '', { post_id: '1', post_url: 'https://www.instagram.com/p/ONE/', media_id: '1', extension: 'jpg' }])}\n`))
  expect(api.list()[0]?.totalAssetCount).toBe(1)
  expect(api.cancel('https://instagram.com/fixture')).toBe(true); expect(kill).toHaveBeenCalledWith(-424242, 'SIGKILL')
  child().emit('close', null); await Promise.all([first, duplicate])
  expect(api.cancel('https://instagram.com/fixture')).toBe(false)
})

it('gallery direct-spawn callback order is std before protocol progress, final carry is flushed after close', async () => {
  const { GalleryDlExecutor } = await import('@vidbee/downloader-core-legacy')
  const trace: unknown[] = []
  const executor = new GalleryDlExecutor({ resolveBinaryPath: () => '/fixture/gallery', defaultDownloadDir: '/fixture/out', clock: () => 1000 })
  executor.run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'vsco-gallery', url: 'https://vsco.co/fixture/gallery' } }, {
    onSpawn: (e) => trace.push(['spawn', e]), onProgress: (e) => trace.push(['progress', e]), onStd: (e) => trace.push(['std', e]), onFinish: (e) => trace.push(['finish', e])
  })
  const observations: unknown[] = [['run-return', structuredClone(trace)]]
  for (const [stream, text] of [['stdout', '__VIDBEE_GDL__\tprepare\t/fixture/image.jpg\n'], ['stderr', 'warning\nunterminated'], ['stdout', '__VIDBEE_GDL__\tunknown\t/fixture/image.jpg\n'], ['stdout', 'final carry']] as const) {
    child()[stream].emit('data', Buffer.from(text)); observations.push([stream, structuredClone(trace)])
  }
  child().emit('close', 7); observations.push(['close-return', structuredClone(trace)]); await turns(); observations.push(['drained', structuredClone(trace)])
  expect(observations).toMatchSnapshot()
})
it('gallery cancellation and pause signal group immediately, replace timer, and wait for close', async () => {
  vi.useFakeTimers(); const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  const { GalleryDlExecutor } = await import('@vidbee/downloader-core-legacy')
  const trace: string[] = []
  const run = new GalleryDlExecutor({ resolveBinaryPath: () => '/fixture/gallery', defaultDownloadDir: '/fixture/out', killGraceMs: 100 }).run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'vsco-gallery', url: 'https://vsco.co/fixture/gallery' } }, { onSpawn() {}, onProgress() {}, onStd() {}, onFinish: (e) => trace.push(e.result.type) })
  await run.pause(); await run.cancel(200); expect(kill.mock.calls).toEqual([[-424242, 'SIGTERM'], [-424242, 'SIGTERM']]); expect(trace).toEqual([])
  vi.advanceTimersByTime(100); expect(kill).toHaveBeenCalledTimes(2); vi.advanceTimersByTime(100); expect(kill).toHaveBeenLastCalledWith(-424242, 'SIGKILL')
  child().emit('close', null); await turns(); expect(trace).toEqual(['cancelled']); expect(vi.getTimerCount()).toBe(0)
})

for (const [kind, url] of [
  ['instagram-profile-category', 'https://www.instagram.com/fixture/posts/'], ['pinterest-gallery', 'https://www.pinterest.com/pin/123/'], ['vsco-gallery', 'https://vsco.co/fixture/gallery'], ['facebook-gallery', 'https://www.facebook.com/fixture/photos'], ['tiktok-photo', 'https://www.tiktok.com/@fixture/photo/123456'], ['threads-post', 'https://www.threads.com/@fixture/post/ABCDEF'], ['threads-profile', 'https://www.threads.com/@fixture/media'], ['snapchat-media', 'https://www.snapchat.com/@fixture/stories'], ['social-media', 'https://x.com/fixture/tweets']
] as const) it(`exact gallery builder argv, env PATH and override templates: ${kind}`, async () => {
  const { GalleryDlExecutor } = await import('@vidbee/downloader-core-legacy')
  new GalleryDlExecutor({ resolveBinaryPath: () => '/fixture/gallery', defaultDownloadDir: '/fixture/default', resolveFfmpegLocation: () => '/fixture/ffmpeg', resolveExtraArgs: () => ['--proxy', 'http://proxy.invalid'] }).run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind, url, options: { customDownloadPath: '/fixture/override', galleryDlDirectoryTemplate: '/fixture/template', galleryDlBaseDirectory: '/fixture/base', galleryDlDirectorySegments: [' A ', 'B'], galleryDlFilenameTemplate: '{id}.{extension}', galleryDlFilter: 'extension == jpg', expectedAssetCount: 2, socialInspect: true, socialMap: true, socialKnownItemsFile: '/fixture/known.json', socialMedia: { media: 'videos', maxPosts: 2 } } } }, { onSpawn() {}, onProgress() {}, onStd() {}, onFinish() {} })
  const call = mock.calls[0]; expect(call?.slice(0, 2)).toMatchSnapshot()
  expect(call?.[2]).toEqual({ stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: true, env: { ...process.env, PATH: `/fixture/ffmpeg:${process.env.PATH ?? ''}` } })
  child().emit('close', 1); await turns()
})

it('Instagram cache eviction follows insertion order while empty-category reads bypass capacity enforcement', async () => {
  const api = new InstagramProfileInspector({ resolveBinaryPath: () => '/fixture/gallery', maxCacheEntries: 2, clock: () => 1000 })
  const one = await api.inspect('https://instagram.com/one', undefined, [])
  const two = await api.inspect('https://instagram.com/two', undefined, [])
  const three = await api.inspect('https://instagram.com/three', undefined, [])
  expect(api.list()).toHaveLength(3)
  expect(api.get(one.inspectionId)).not.toBeNull() // reading it does not refresh insertion order
  const pending = api.inspect('https://instagram.com/three', undefined, ['posts']); await turns(); child().stdout.emit('data', Buffer.from('[]')); child().emit('close', 0); await pending
  expect(api.get(one.inspectionId)).toBeNull(); expect(api.get(two.inspectionId)).toBeNull(); expect(api.get(three.inspectionId)).not.toBeNull()
})

it('generic mapper Windows PID-only branch differs from group target and missing PID is guarded', async () => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  try {
    const api = mapper(); api.map(url, 'posts'); await turns()
    const pending = api.stop(url); expect(kill).toHaveBeenCalledWith(424242, 'SIGKILL'); child().emit('close', null); await pending
  } finally { if (original) Object.defineProperty(process, 'platform', original) }
})
it('gallery oversized carries retain one Mi character, tails retain 8192 and stderr final carry is not forwarded', async () => {
  const { GalleryDlExecutor } = await import('@vidbee/downloader-core-legacy')
  const std: { stream: string; line: string }[] = []; let finish: import('@vidbee/task-queue-legacy').ExecutorFinishEvent | undefined
  new GalleryDlExecutor({ resolveBinaryPath: () => '/fixture/gallery', defaultDownloadDir: '/fixture/out' }).run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'vsco-gallery', url: 'https://vsco.co/fixture/gallery' } }, { onSpawn() {}, onProgress() {}, onStd: (e) => { std.push(e) }, onFinish: (e) => { finish = e } })
  child().stdout.emit('data', Buffer.from('x'.repeat(1024 * 1024 + 10))); child().stderr.emit('data', Buffer.from('y'.repeat(1024 * 1024 + 10)))
  expect(std).toEqual([]); child().emit('close', 1); await turns()
  expect(std).toHaveLength(1); expect(std[0]?.stream).toBe('stdout'); expect(std[0]?.line.length).toBe(1024 * 1024)
  expect(finish?.stdoutTail).toBe('x'.repeat(8192)); expect(finish?.stderrTail).toBe('y'.repeat(8192))
})

it('gallery verification suspends finish, and cancellation after stat starts wins on resume', async () => {
  const { GalleryDlExecutor } = await import('@vidbee/downloader-core-legacy')
  vi.spyOn(process, 'kill').mockImplementation(() => true)
  const dir = root(); const file = join(dir, 'image.jpg'); writeFileSync(file, 'media')
  let release: () => void = () => {}; mock.gatePath = file; mock.statGate = new Promise<void>((resolve) => { release = resolve })
  let finish: import('@vidbee/task-queue-legacy').ExecutorFinishEvent | undefined
  const run = new GalleryDlExecutor({ resolveBinaryPath: () => '/fixture/gallery', defaultDownloadDir: dir }).run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'instagram-profile-category', url: 'https://instagram.com/fixture/posts' } }, { onSpawn() {}, onProgress() {}, onStd() {}, onFinish: (e) => { finish = e } })
  child().stdout.emit('data', Buffer.from(`__VIDBEE_GDL__\tprepare\t${file}\n__VIDBEE_GDL__\tafter\t${file}\n`)); child().emit('close', 0)
  expect(finish).toBeUndefined(); await run.cancel(0); expect(finish).toBeUndefined(); release()
  for (let i = 0; i < 100 && !finish; i++) await new Promise((resolve) => setTimeout(resolve, 1))
  expect(finish?.result.type).toBe('cancelled')
})
