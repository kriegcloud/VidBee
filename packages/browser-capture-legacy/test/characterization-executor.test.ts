import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import type { Executor, ExecutorContext, ExecutorEvents, ExecutorFinishEvent, ExecutorRun } from '@vidbee/task-queue-legacy'
import { virtualError } from '@vidbee/task-queue-legacy'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'

const host = vi.hoisted(() => ({ available: true, browser: '/fixture/chromium' as string | null, spawn: vi.fn(), mkdir: vi.fn(), stat: vi.fn(), write: vi.fn(), temp: vi.fn(), kill: vi.fn(), paths: [] as string[] }))
vi.mock('node:fs', async (original) => ({ ...await original<typeof import('node:fs')>(), existsSync: (file: string) => { host.paths.push(file); return file === '/fixture/Xvfb' || file === host.browser } }))
// Token lookup is isolated at its public dependency rather than reading any real browser directory.
vi.mock('@vidbee/downloader-core/cookie-browser-paths', () => ({ getBrowserProfileCandidates: vi.fn(() => []) }))
vi.mock('node:child_process', async (original) => ({ ...await original<typeof import('node:child_process')>(), spawn: host.spawn, spawnSync: (_command: string, args: string[]) => ({ stdout: args[0] === 'Xvfb' ? (host.available ? '/fixture/Xvfb' : '') : (host.browser ?? '') }) }))
vi.mock('node:fs/promises', () => ({ mkdir: host.mkdir, stat: host.stat, writeFile: host.write, mkdtemp: host.temp }))
vi.mock('@vidbee/task-queue-legacy/process', () => ({ killProcessTree: host.kill }))
import { BrowserCaptureExecutor, DrmFallbackExecutor, DRM_FALLBACK_MESSAGE, VIRTUAL_DISPLAY_SIZE } from '@vidbee/browser-capture-legacy'

const ctx: ExecutorContext = { taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url: 'https://fixture.invalid/video', title: 'Fixture' } }
const turns = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const event = (value: unknown) => `__VIDBEE_CAPTURE__${JSON.stringify(value)}`
const finish = (message = 'DRM protected'): ExecutorFinishEvent => ({ taskId: 'task', attemptId: 'attempt', result: { type: 'error', error: virtualError('unknown', message), exitCode: 1 }, closedAt: 1000, stdoutTail: '', stderrTail: '' })
function setup() {
  const child = new ChildProcess()
  Object.defineProperties(child, { pid: { value: 42 }, stdout: { value: new PassThrough() }, stderr: { value: new PassThrough() } })
  host.spawn.mockReturnValue(child)
  const trace: unknown[] = []
  const callbacks: ExecutorEvents = { onSpawn: (e) => trace.push(['spawn', e]), onStd: (e) => trace.push(['std', e]), onProgress: (e) => trace.push(['progress', e]), onFinish: (e) => trace.push(['finish', e]) }
  const executor = new BrowserCaptureExecutor({ resolveSidecarScript: () => '/fixture/sidecar.js', resolveFfmpegPath: () => '/fixture/ffmpeg', defaultDownloadDir: '/fixture/downloads', execPath: '/fixture/node', execArgv: ['--fixture'], env: { FIXTURE: 'yes', ELECTRON_RUN_AS_NODE: 'override' } })
  return { child, trace, callbacks, executor }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000); vi.clearAllMocks(); host.paths.length = 0; host.available = true; host.browser = '/fixture/chromium'
  host.mkdir.mockResolvedValue(undefined); host.temp.mockResolvedValue('/fixture/job-dir'); host.write.mockResolvedValue(undefined)
  host.stat.mockImplementation(async (p: string) => { if (p === '/fixture/result.mp4') return { size: 3 }; throw new Error('absent') })
})
afterEach(() => vi.useRealTimers())

describe('public capture executor raw callback characterization', () => {
  it('defers unavailable finish and retains complete event and no-op controls', async () => {
    host.available = false
    const h = setup(); const run = h.executor.run(ctx, h.callbacks)
    expect(h.trace).toEqual([]); queueMicrotask(() => h.trace.push('marker')); await turns()
    expect(h.trace).toEqual([['finish', { taskId: 'task', attemptId: 'attempt', result: { type: 'error', error: virtualError('binary-missing', 'In-browser capture needs Linux, Xvfb, and Chrome/Brave/Edge with Widevine.'), exitCode: null }, closedAt: 1000, stdoutTail: '', stderrTail: 'In-browser capture needs Linux, Xvfb, and Chrome/Brave/Edge with Widevine.' }], 'marker'])
    await run.cancel(); await run.pause(); expect(host.spawn).not.toHaveBeenCalled()
  })
  it('writes exact job and spawn shape, then delivers complete immediate callbacks and late finish', async () => {
    const h = setup(); h.executor.run(ctx, h.callbacks); expect(h.trace).toEqual([]); await turns()
    expect(host.mkdir).toHaveBeenCalledWith('/fixture/downloads', { recursive: true })
    expect(host.write).toHaveBeenCalledWith('/fixture/job-dir/job.json', '{"url":"https://fixture.invalid/video","outputPath":"/fixture/downloads/Fixture (browser capture).mp4","ffmpegPath":"/fixture/ffmpeg","browserExecutable":"/fixture/chromium","width":3840,"height":3840}\n')
    expect(host.spawn).toHaveBeenCalledWith('/fixture/node', ['--fixture', '/fixture/sidecar.js', '--job', '/fixture/job-dir/job.json'], { env: { ...process.env, FIXTURE: 'yes', ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    expect(h.child.listenerCount('error')).toBe(1); expect(h.child.listenerCount('close')).toBe(1)
    const spawn = ['spawn', { taskId: 'task', attemptId: 'attempt', pid: 42, pidStartedAt: null, kind: 'ffmpeg', spawnedAt: 1000 }]
    expect(h.trace).toEqual([spawn])
    h.child.stderr?.emit('data', Buffer.from(event({ type: 'log', message: 'from stderr' })))
    expect(h.trace).toEqual([spawn, ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stdout', line: 'from stderr' }]])
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'progress', percent: 0.96, currentTime: 3, duration: 5 })))
    expect(h.trace.at(-1)).toEqual(['progress', { taskId: 'task', attemptId: 'attempt', enteredProcessing: true, progress: { percent: 0.96, bytesDownloaded: null, bytesTotal: null, speedBps: null, etaMs: 2000, ticks: 1 } }])
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'done', filePath: '/fixture/result.mp4', size: 'ignored', durationMs: 1250 })))
    h.child.emit('close', 0); expect(h.trace).toHaveLength(3); await turns()
    expect(h.trace.at(-1)).toEqual(['finish', { taskId: 'task', attemptId: 'attempt', result: { type: 'success', output: { filePath: '/fixture/result.mp4', size: 3, durationMs: 1250, sha256: null, formatId: 'browser-capture' } }, closedAt: 1000, stdoutTail: `${event({ type: 'progress', percent: 0.96, currentTime: 3, duration: 5 })}\n${event({ type: 'done', filePath: '/fixture/result.mp4', size: 'ignored', durationMs: 1250 })}\n`, stderrTail: `${event({ type: 'log', message: 'from stderr' })}\n` }])
    expect(h.child.listenerCount('error')).toBe(1); expect(h.child.listenerCount('close')).toBe(0)
  })
  it('loses split protocol and UTF-8, emits nonblank CR/LF chunks immediately and retains code-unit tails', async () => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    for (const text of ['__VIDBEE_CAP', 'TURE__{"type":"log","message":"lost"}', '\r\nplain\r\n\n', event({ type: 'unknown', x: true })]) h.child.stdout?.emit('data', Buffer.from(text))
    const utf8 = Buffer.from('é'); h.child.stderr?.emit('data', utf8.subarray(0, 1)); h.child.stderr?.emit('data', utf8.subarray(1))
    expect(h.trace.slice(1)).toEqual([
      ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stdout', line: '__VIDBEE_CAP' }],
      ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stdout', line: 'TURE__{"type":"log","message":"lost"}' }],
      ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stdout', line: 'plain' }],
      ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stderr', line: '�' }],
      ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stderr', line: '�' }]
    ])
    h.child.stderr?.emit('data', Buffer.from('x'.repeat(9000))); h.child.emit('close', 2); await turns()
    const last = h.trace.at(-1); expect(Array.isArray(last) && last[1].stderrTail).toBe('x'.repeat(8191) + '\n')
  })
  it.each([
    { type: 'log', message: { unexpected: true } },
    { type: 'progress', percent: '0.99', currentTime: null, duration: '5' },
    { type: 'progress', percent: null, currentTime: [], duration: 1e300 }
  ])('pins section-9 consumed malformed delivery %#', async (payload) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns(); h.child.stdout?.emit('data', Buffer.from(event(payload)))
    // Before the port: if (payload.type === 'log') expect(h.trace.at(-1)).toEqual(['std', { taskId: 'task', attemptId: 'attempt', stream: 'stdout', line: payload.message }])
    // Before the port: else expect(h.trace.at(-1)).toEqual(['progress', { taskId: 'task', attemptId: 'attempt', enteredProcessing: Number(payload.percent) > .95, progress: { percent: payload.percent, bytesDownloaded: null, bytesTotal: null, speedBps: null, etaMs: Number(payload.duration) > Number(payload.currentTime) ? Math.round((Number(payload.duration) - Number(payload.currentTime)) * 1000) : null, ticks: 1 } }])
    expect(h.trace).toHaveLength(1)
    h.child.emit('close', 1); await turns()
    const last = h.trace.at(-1)
    expect(Array.isArray(last) && last[1].result).toEqual({ type: 'error', error: virtualError('unknown', 'Invalid browser-capture data.'), exitCode: 1 })
  })
  it.each([undefined, null, 'wrong-kind', { unexpected: true }])('pins section-9 malformed done duration %# and ignored size/spawn', async (durationMs) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'spawn', pid: { ignored: true } })))
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'done', filePath: '/fixture/result.mp4', size: { ignored: true }, durationMs })))
    expect(h.trace).toHaveLength(1); h.child.emit('close', 0); await turns()
    const last = h.trace.at(-1)
    // Before the port: expect(Array.isArray(last) && last[1].result).toEqual({ type: 'success', output: { filePath: '/fixture/result.mp4', size: 3, durationMs: durationMs ?? null, sha256: null, formatId: 'browser-capture' } })
    expect(Array.isArray(last) && last[1].result).toEqual(durationMs === undefined || durationMs === null
      ? { type: 'success', output: { filePath: '/fixture/result.mp4', size: 3, durationMs: durationMs ?? null, sha256: null, formatId: 'browser-capture' } }
      : { type: 'error', error: virtualError('unknown', 'Invalid browser-capture data.'), exitCode: 1 })
  })
  it('pins section-9 JSON exponent overflow delivered as infinite protocol progress', async () => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    h.child.stdout?.emit('data', Buffer.from('__VIDBEE_CAPTURE__{"type":"progress","percent":1e999,"currentTime":1,"duration":1e999}'))
    // Before the port: expect(h.trace.at(-1)).toEqual(['progress', { taskId: 'task', attemptId: 'attempt', enteredProcessing: true, progress: { percent: Infinity, bytesDownloaded: null, bytesTotal: null, speedBps: null, etaMs: Infinity, ticks: 1 } }])
    expect(h.trace).toHaveLength(1)
    h.child.emit('close', 1); await turns()
    const last = h.trace.at(-1)
    expect(Array.isArray(last) && last[1].result).toEqual({ type: 'error', error: virtualError('unknown', 'Invalid browser-capture data.'), exitCode: 1 })
  })
  it('pins section-9 missing log field and object error-message coercion', async () => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'log' })))
    // Before the port: expect(h.trace.at(-1)).toEqual(['std', { taskId: 'task', attemptId: 'attempt', stream: 'stdout', line: undefined }])
    expect(h.trace).toHaveLength(1)
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'error', message: { external: true } }))); h.child.emit('close', 0); await turns()
    const last = h.trace.at(-1)
    // Before the port: expect(Array.isArray(last) && last[1].result).toEqual({ type: 'error', error: virtualError('unknown', '[object Object]'), exitCode: 1 })
    expect(Array.isArray(last) && last[1].result).toEqual({ type: 'error', error: virtualError('unknown', 'Invalid browser-capture data.'), exitCode: 1 })
  })
  it('preserves callback throw identity at stream emission and permits cancellation re-entry', async () => {
    const h = setup(); const run = h.executor.run(ctx, h.callbacks); await turns(); const failure = { callback: 'std' }
    h.callbacks.onStd = () => { throw failure }
    let caught: unknown; try { h.child.stdout?.emit('data', Buffer.from('plain')) } catch (error) { caught = error }; expect(caught).toBe(failure)
    h.callbacks.onProgress = () => { void run.cancel(0) }
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'progress', percent: .1, currentTime: 1, duration: 10 })))
    expect(host.kill.mock.calls).toEqual([[42, 'SIGTERM'], [42, 'SIGTERM']]); h.child.emit('close', 0); await turns(); await vi.runAllTimersAsync()
    expect(h.trace.at(-1)).toEqual(['finish', { taskId: 'task', attemptId: 'attempt', result: { type: 'cancelled' }, closedAt: 1000, stdoutTail: `plain\n${event({ type: 'progress', percent: .1, currentTime: 1, duration: 10 })}\n`, stderrTail: '' }])
  })
  it.each(['ffmpeg login cancel', 'login cancel', 'cancel', 'other'])('orders saved-error classification %s before nonzero diagnostics', async (message) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns(); h.child.stdout?.emit('data', Buffer.from(event({ type: 'error', message }))); h.child.emit('close', 17); await turns()
    const kind = message.includes('ffmpeg') ? 'binary-missing' : message.includes('login') ? 'auth-required' : message.includes('cancel') ? 'cancelled-by-user' : 'unknown'
    expect(h.trace.at(-1)).toEqual(['finish', { taskId: 'task', attemptId: 'attempt', result: { type: 'error', error: virtualError(kind, message), exitCode: 1 }, closedAt: 1000, stdoutTail: `${event({ type: 'error', message })}\n`, stderrTail: '' }])
  })
})

describe('public DRM fallback synchronous handle and callback contract', () => {
  it.each([true, false])('retains active handle overwrite after synchronous primary finish (available=%s)', async (available) => {
    const trace: unknown[] = []; const controls = (name: string): ExecutorRun => ({ cancel: async (n) => { trace.push([name, 'cancel', n]) }, pause: async () => { trace.push([name, 'pause']) } })
    const primary: Executor = { run(_ctx, events) { trace.push('primary'); events.onFinish(finish()); trace.push('primary-return'); return controls('primary') } }
    const capture: Executor = { run() { trace.push('capture'); return controls('capture') } }
    const events: ExecutorEvents = { onSpawn() {}, onProgress() {}, onStd: (e) => { trace.push(['std', e]) }, onFinish: (e) => { trace.push(['finish', e]) } }
    const run = new DrmFallbackExecutor(primary, capture, () => available).run(ctx, events)
    expect(trace).toEqual(available ? ['primary', ['std', { taskId: 'task', attemptId: 'attempt', stream: 'stderr', line: DRM_FALLBACK_MESSAGE }], 'capture', 'primary-return'] : ['primary', ['finish', finish()], 'primary-return'])
    await run.cancel(7); await run.pause(); expect(trace.slice(-2)).toEqual([['primary', 'cancel', 7], ['primary', 'pause']])
  })
})
