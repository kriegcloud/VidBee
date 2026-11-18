import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { DownloaderCore, GalleryDlExecutor, YtDlpExecutor } from '@vidbee/downloader-core'
import type { ExecutorContext, ExecutorEvents } from '@vidbee/task-queue-legacy'

const ctx: ExecutorContext = { taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url: 'https://fixture.invalid/video' } }
function harness(t: { mock: { method: typeof import('node:test').mock.method } }, kind: 'yt' | 'gallery') {
  const child = Object.assign(new childProcess.ChildProcess(), { stdout: new PassThrough(), stderr: new PassThrough() })
  t.mock.method(childProcess, 'spawn', () => child); syncBuiltinESMExports()
  const trace: unknown[] = []
  const callbacks: ExecutorEvents = {
    onSpawn: (e) => trace.push(['spawn', e]), onProgress: (e) => trace.push(['progress', e]), onProcessing: (e) => trace.push(['processing', e]), onStd: (e) => trace.push(['std', e]), onFinish: (e) => trace.push(['finish', e])
  }
  const executor = kind === 'yt' ? new YtDlpExecutor({ resolveYtDlpPath: () => '/fixture/yt-dlp', resolveFfmpegLocation: () => '/fixture/ffmpeg', defaultDownloadDir: '/fixture/out', clock: () => 1000 }) : new GalleryDlExecutor({ resolveBinaryPath: () => '/fixture/gallery', defaultDownloadDir: '/fixture/out', clock: () => 1000 })
  return { child, trace, callbacks, run: () => executor.run(kind === 'yt' ? ctx : { ...ctx, input: { kind: 'vsco-gallery', url: 'https://vsco.co/fixture/gallery' } }, callbacks) }
}
const turns = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function compare(name: string, value: unknown) {
  const file = new URL(`./fixtures/raw-${name}.json`, import.meta.url)
  const normalized = JSON.parse(JSON.stringify(value))
  if (process.env.VIDBEE_RECORD_CHARACTERIZATION === '1') writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n')
  assert.deepEqual(normalized, JSON.parse(readFileSync(file, 'utf8')))
}
for (const kind of ['yt', 'gallery'] as const) test(`${kind} controlled raw child → real wrapper/direct executor → callbacks immediate observations`, async (t) => {
  const h = harness(t, kind); h.run(); const observations: unknown[] = [['returned', structuredClone(h.trace)]]
  for (const [event, payload] of [['stdout', Buffer.from('[download] 20% of 10MiB at 1MiB/s ETA 00:08\r[download] 50% of 10MiB\n[Merger] combine\n')], ['stderr', Buffer.from('diagnostic\n')], ['error', new Error('original-child-error')], ['close', 7], ['stdout', Buffer.from('after completion\n')]] as const) {
    if (event === 'stdout' || event === 'stderr') h.child[event].emit('data', payload)
    else h.child.emit(event, payload)
    observations.push([event, structuredClone(h.trace)])
  }
  await turns(); observations.push(['drained', structuredClone(h.trace)]); compare(kind, observations)
})
for (const kind of ['yt', 'gallery'] as const) {
  for (const callback of ['spawn', 'std', 'stderr', 'finish', 'progress', ...(kind === 'yt' ? ['processing'] as const : [])] as const) test(`${kind} ${callback} callback throw preserves exact identity and location`, async (t) => {
    const h = harness(t, kind); const original = { callback }; let called = 0
    const fail = () => { called++; throw original }
    if (callback === 'spawn') h.callbacks.onSpawn = fail
    if (callback === 'std' || callback === 'stderr') h.callbacks.onStd = fail
    if (callback === 'progress') h.callbacks.onProgress = fail
    if (callback === 'processing') h.callbacks.onProcessing = fail
    if (callback === 'finish') h.callbacks.onFinish = fail
    if (callback === 'spawn') assert.throws(h.run, (e) => e === original)
    else {
      h.run()
      if (callback === 'std') assert.throws(() => h.child.stdout.emit('data', Buffer.from('ordinary\n')), (e) => e === original)
      if (callback === 'stderr') assert.throws(() => h.child.stderr.emit('data', Buffer.from('diagnostic\n')), (e) => e === original)
      if (callback === 'progress') assert.throws(() => h.child.stdout.emit('data', Buffer.from(kind === 'yt' ? '[download] 20% of 10MiB\n[Merger] later\n' : '__VIDBEE_GDL__\tprepare\t/fixture/file.jpg\n')), (e) => e === original)
      if (callback === 'processing') assert.throws(() => h.child.stdout.emit('data', Buffer.from('[Merger] combine\n')), (e) => e === original)
      if (callback === 'finish') {
        if (kind === 'yt') assert.throws(() => h.child.emit('close', 0), (e) => e === original)
        else { assert.doesNotThrow(() => h.child.emit('close', 7)); await turns() }
      } else { h.child.emit('close', 0); await turns() }
    }
    assert.equal(called, 1)
    if (callback === 'progress' && kind === 'yt') {
      assert.deepEqual(h.trace.map((v) => Array.isArray(v) ? v[0] : v), ['spawn', 'finish'])
      const finish = h.trace.at(-1); assert.ok(Array.isArray(finish)); assert.equal(finish[1].stdoutTail, '')
    }
    if (callback === 'processing') assert.equal(h.trace.some((v) => Array.isArray(v) && v[0] === 'std'), false)
  })
}

for (const callback of ['progress', 'std'] as const) test(`yt cancel re-entry from ${callback} callback completes synchronous work before return`, async (t) => {
  const h = harness(t, 'yt'); let run: ReturnType<typeof h.run>; let cancelled = false
  const reenter = (event: Parameters<ExecutorEvents['onProgress']>[0] | Parameters<ExecutorEvents['onStd']>[0]) => {
    if ('progress' in event) h.trace.push(['progress', event]); else h.trace.push(['std', event])
    if (!cancelled) { cancelled = true; void run.cancel(0); h.trace.push('cancel-return') }
  }
  if (callback === 'progress') h.callbacks.onProgress = reenter; else h.callbacks.onStd = reenter
  run = h.run()
  h.child.stdout.emit('data', Buffer.from('[download] 50% of 10MiB\n[Merger] combine\n'))
  h.child.emit('close', 0); compare(`cancel-${callback}`, h.trace)
})

for (const scenario of ['valid', 'raw-error-zero', 'nonzero', 'empty'] as const) test(`Core metadata controlled raw boundary ${scenario}`, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-core-raw-')); const saved = { ...process.env }
  t.after(() => { process.env = saved; rmSync(dir, { recursive: true, force: true }) })
  const binary = join(dir, 'ytdlp'); writeFileSync(binary, 'fixture'); writeFileSync(join(dir, 'ffmpeg'), ''); writeFileSync(join(dir, 'ffprobe'), '')
  process.env.YTDLP_PATH = binary; process.env.FFMPEG_PATH = dir; process.env.YTDLP_JS_RUNTIME = 'none'
  const h = harness(t, 'yt'); const core = new DownloaderCore({ downloadDir: join(dir, 'downloads') }); const trace: string[] = []
  const pending = core.getVideoInfo('https://fixture.invalid/watch').then((value) => { trace.push('settled-success'); return value }, (error: unknown) => { trace.push('settled-error'); throw error })
  trace.push('returned'); queueMicrotask(() => trace.push('marker')); await turns()
  if (scenario !== 'empty') h.child.stdout.emit('data', Buffer.from(JSON.stringify({ title: 'x'.repeat(9000) })))
  trace.push('stdout-return'); assert.deepEqual(trace, ['returned', 'marker', 'stdout-return'])
  const original = new Error('original raw process error')
  if (scenario === 'raw-error-zero') h.child.emit('error', original)
  if (scenario === 'nonzero') h.child.stderr.emit('data', Buffer.from('full stderr'))
  h.child.emit('close', scenario === 'nonzero' ? 7 : 0); trace.push('close-return')
  if (scenario === 'empty') await assert.rejects(pending, { message: 'yt-dlp exited with code 0' })
  else if (scenario === 'nonzero') await assert.rejects(pending, { message: '\nError code: 7\n\nStderr:\nfull stderr' })
  else assert.equal((await pending).title, 'x'.repeat(9000))
  assert.deepEqual(trace, ['returned', 'marker', 'stdout-return', 'close-return', scenario === 'empty' || scenario === 'nonzero' ? 'settled-error' : 'settled-success'])
})
test('Core EventEmitter listener throw rejects createDownload with original value after synchronous active-state mutation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-core-callback-')); const saved = { ...process.env }
  t.after(() => { process.env = saved; rmSync(dir, { recursive: true, force: true }) })
  const binary = join(dir, 'ytdlp'); writeFileSync(binary, 'fixture'); writeFileSync(join(dir, 'ffmpeg'), ''); writeFileSync(join(dir, 'ffprobe'), '')
  process.env.YTDLP_PATH = binary; process.env.FFMPEG_PATH = dir; process.env.YTDLP_JS_RUNTIME = 'none'
  const h = harness(t, 'yt'); const core = new DownloaderCore({ downloadDir: join(dir, 'downloads') }); const failure = { listener: 'opaque' }
  core.once('task-updated', () => { throw failure })
  await assert.rejects(core.createDownload({ url: 'https://fixture.invalid/watch', type: 'video' }), (error) => error === failure)
  assert.deepEqual(core.getStatus(), { active: 1, pending: 0 })
  h.child.emit('close', 0); assert.deepEqual(core.getStatus(), { active: 1, pending: 0 }); assert.deepEqual(core.listHistory(), []) // listener threw before close handlers were bound
})

for (const kind of ['yt', 'gallery'] as const) test(`${kind} POSIX group failure ${kind === 'yt' ? 'falls back to PID' : 'has no PID fallback'} and acknowledges without close`, async (t) => {
  const h = harness(t, kind); Object.defineProperty(h.child, 'pid', { value: 424242 })
  const signals: unknown[][] = []; t.mock.method(process, 'kill', (pid: number, signal?: NodeJS.Signals | number) => { signals.push([pid, signal]); if (pid < 0) throw new Error('group gone'); return true })
  const run = h.run(); await run.cancel(0)
  assert.deepEqual(signals, kind === 'yt' ? [[-424242, 'SIGTERM'], [424242, 'SIGTERM'], [-424242, 'SIGKILL'], [424242, 'SIGKILL']] : [[-424242, 'SIGTERM'], [-424242, 'SIGKILL']])
  assert.equal(h.trace.some((entry) => Array.isArray(entry) && entry[0] === 'finish'), false)
  h.child.emit('close', 0); await turns()
})
for (const kind of ['yt', 'gallery'] as const) test(`${kind} injected Windows cancellation always uses forced taskkill tree flags`, async (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform'); t.after(() => { if (platform) Object.defineProperty(process, 'platform', platform) })
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  const h = harness(t, kind); Object.defineProperty(h.child, 'pid', { value: 424242 })
  const calls: unknown[][] = []; t.mock.method(childProcess, 'execFile', (...args: unknown[]) => { calls.push(args.slice(0, 2)); return h.child }); syncBuiltinESMExports()
  const run = h.run(); await run.cancel(0)
  assert.deepEqual(calls, [['taskkill', ['/PID', '424242', '/T', '/F']], ['taskkill', ['/PID', '424242', '/T', '/F']]])
  h.child.emit('close', 0); await turns()
})
test('Instagram injected Windows cancel uses forced tree taskkill once and retains cancelled result', async (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform'); t.after(() => { if (platform) Object.defineProperty(process, 'platform', platform) })
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  const h = harness(t, 'gallery'); Object.defineProperty(h.child, 'pid', { value: 424242 })
  const calls: unknown[][] = []; t.mock.method(childProcess, 'execFile', (...args: unknown[]) => { calls.push(args.slice(0, 2)); return h.child }); syncBuiltinESMExports()
  const { InstagramProfileInspector } = await import('@vidbee/downloader-core')
  const api = new InstagramProfileInspector({ resolveBinaryPath: () => '/fixture/gallery' })
  const pending = api.inspect('https://instagram.com/fixture', undefined, ['posts']); await turns()
  assert.equal(api.cancel('https://instagram.com/fixture'), true)
  assert.deepEqual(calls, [['taskkill', ['/PID', '424242', '/T', '/F']]])
  h.child.emit('close', null); const result = await pending; assert.equal(result.categories.find((entry) => entry.category === 'posts')?.state, 'cancelled')
})
