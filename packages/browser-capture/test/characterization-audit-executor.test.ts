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
import { BrowserCaptureExecutor, DrmFallbackExecutor, DRM_FALLBACK_MESSAGE, VIRTUAL_DISPLAY_SIZE } from '@vidbee/browser-capture'

const ctx: ExecutorContext = { taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url: 'https://fixture.invalid/video', title: 'Fixture' } }
const turns = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const event = (value: unknown) => `__VIDBEE_CAPTURE__${JSON.stringify(value)}`
const finish = (message = 'DRM protected'): ExecutorFinishEvent => ({ taskId: 'task', attemptId: 'attempt', result: { type: 'error', error: virtualError('unknown', message), exitCode: 1 }, closedAt: 1000, stdoutTail: '', stderrTail: '' })
function setup() {
  const child = new ChildProcess()
  Object.defineProperties(child, { pid: { value: 42, configurable: true }, stdout: { value: new PassThrough() }, stderr: { value: new PassThrough() } })
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

const resultOf = (h: ReturnType<typeof setup>) => {
  const row = h.trace.at(-1)
  if (!Array.isArray(row) || row[0] !== 'finish') throw new Error('Missing finish')
  return row[1] as ExecutorFinishEvent
}
const errorResult = (message: string, category: Parameters<typeof virtualError>[0] = 'unknown') => ({ type: 'error', error: virtualError(category, message), exitCode: 1 })

describe('audit capture failure precedence and classification', () => {
  it.each([
    [2, 'boom', false, 'boom\n'], [3, '', false, 'browser-capture sidecar exited 3'],
    [null, '', false, 'browser-capture sidecar exited -1'], [1, '', true, 'browser-capture sidecar exited 1'],
    [0, '', false, 'browser-capture sidecar exited 0']
  ] as const)('pins exit %s stderr %s done %s', async (code, stderr, done, message) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    if (stderr) h.child.stderr?.emit('data', Buffer.from(stderr))
    const payload = event({ type: 'done', filePath: '/fixture/result.mp4', durationMs: 2 })
    if (done) h.child.stdout?.emit('data', Buffer.from(payload))
    h.child.emit('close', code); await turns()
    expect(resultOf(h)).toEqual({ taskId: 'task', attemptId: 'attempt', closedAt: 1000, stdoutTail: done ? `${payload}\n` : '', stderrTail: stderr ? `${stderr}\n` : '', result: errorResult(message) })
  })
  it.each([
    ['Failed to start Xvfb', 'binary-missing'], ['No Chromium-family browser found to play DRM media', 'binary-missing'],
    ['Please Sign In', 'auth-required'], ['cookie expired', 'auth-required'], ['Capture CANCELLED', 'cancelled-by-user'],
    ['FFMPEG cookie cancel', 'binary-missing']
  ] as const)('classifies %s', async (message, category) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    const payload = event({ type: 'error', message }); h.child.stdout?.emit('data', Buffer.from(payload)); h.child.emit('close', 0); await turns()
    expect(resultOf(h)).toEqual({ taskId: 'task', attemptId: 'attempt', closedAt: 1000, stdoutTail: `${payload}\n`, stderrTail: '', result: errorResult(message, category) })
  })
  it.each(['browser', 'pid', 'error', 'stat'])('pins %s failure', async (failure) => {
    const h = setup(); h.executor.run(ctx, h.callbacks)
    if (failure === 'browser') host.browser = null
    if (failure === 'pid') Object.defineProperty(h.child, 'pid', { value: undefined })
    await turns()
    if (failure === 'error') h.child.emit('error', new Error('spawn EACCES'))
    if (failure === 'stat') { h.child.stdout?.emit('data', Buffer.from(event({ type: 'done', filePath: '/fixture/absent' }))); h.child.emit('close', 0) }
    await turns()
    const messages: Record<string, string> = { browser: 'No Chromium-family browser found to play DRM media', pid: 'Failed to spawn browser-capture sidecar', error: 'spawn EACCES', stat: 'absent' }
    expect(resultOf(h)).toEqual({ taskId: 'task', attemptId: 'attempt', closedAt: 1000, stdoutTail: failure === 'stat' ? `${event({ type: 'done', filePath: '/fixture/absent' })}\n` : '', stderrTail: '', result: errorResult(messages[failure]!, failure === 'browser' ? 'binary-missing' : 'unknown') })
    if (failure === 'browser') expect(host.write).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 1])('section-9 done filePath %s', async (filePath) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'done', filePath }))); h.child.emit('close', 0); await turns()
    expect(resultOf(h).result).toEqual(errorResult(filePath ? 'absent' : 'browser-capture sidecar exited 0'))
    if (filePath) expect(host.stat).toHaveBeenCalledWith(filePath)
  })
  it.each([undefined, '', 0, 1])('section-9 error message %s before done', async (message) => {
    const h = setup(); h.executor.run(ctx, h.callbacks); await turns()
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'error', message })))
    h.child.stdout?.emit('data', Buffer.from(event({ type: 'done', filePath: '/fixture/result.mp4' }))); h.child.emit('close', 0); await turns()
    expect(resultOf(h).result).toEqual(message ? errorResult('1') : { type: 'success', output: { filePath: '/fixture/result.mp4', size: 3, durationMs: null, sha256: null, formatId: 'browser-capture' } })
  })
})

describe('audit capture options and cancellation', () => {
  it.each([
    [{ customDownloadPath: ' /a ', settings: { downloadPath: '/b', cookiesPath: ' /c ' }, downloadPath: '/d', duration: 7 }, '/a', '/c', 7],
    [{ settings: { downloadPath: ' /b ', cookiesPath: '   ' }, downloadPath: '/d', duration: '5' }, '/b', undefined, undefined],
    [{ downloadPath: ' /d ', duration: 0 }, '/d', undefined, 0],
    [{ duration: -2 }, '/fixture/downloads', undefined, -2],
    [{ duration: NaN }, '/fixture/downloads', undefined, null],
    ['wrong kind', '/fixture/downloads', undefined, undefined]
  ])('pins job options %#', async (options, directory, cookiesPath, durationHintSec) => {
    const h = setup(); Reflect.apply(h.executor.run, h.executor, [{ ...ctx, input: { ...ctx.input, options } }, h.callbacks]); await turns()
    expect(host.mkdir).toHaveBeenCalledWith(directory, { recursive: true })
    expect(host.write.mock.calls).toEqual([['/fixture/job-dir/job.json', `${JSON.stringify({ url: ctx.input.url, outputPath: `${directory}/Fixture (browser capture).mp4`, ffmpegPath: '/fixture/ffmpeg', cookiesPath, browserExecutable: '/fixture/chromium', width: 3840, height: 3840, durationHintSec })}\n`]])
    h.child.emit('close', 1); await turns()
  })
  it.each([['T/x', 'T x'], [undefined, 'video']])('pins title fallback %s and collision suffix', async (title, safe) => {
    const h = setup(); host.stat.mockResolvedValue({ size: 3 })
    h.executor.run({ ...ctx, input: { ...ctx.input, title: undefined, options: { title } } }, h.callbacks); await turns()
    expect(JSON.parse(host.write.mock.calls[0]![1]).outputPath).toBe(`/fixture/downloads/${safe} (browser capture) 1000.mp4`)
    h.child.emit('close', 1); await turns()
  })
  it.each(['pause', 'default', 'explicit', 'configured', 'closed'] as const)('pins %s grace and escalation', async (mode) => {
    const h = setup()
    const executor = mode === 'configured' ? new BrowserCaptureExecutor({ resolveSidecarScript: () => '/fixture/sidecar.js', resolveFfmpegPath: () => '/fixture/ffmpeg', defaultDownloadDir: '/fixture/downloads', killGraceMs: 500 }) : h.executor
    const run = executor.run(ctx, h.callbacks); await turns()
    let resolved = false
    const pending = (mode === 'pause' ? run.pause() : run.cancel(mode === 'explicit' ? 5000 : undefined)).then(() => { resolved = true })
    expect(host.kill.mock.calls).toEqual([[42, 'SIGTERM'], [42, 'SIGTERM']])
    const grace = mode === 'configured' ? 500 : 2000
    if (mode === 'closed') { h.child.emit('close', 0); await turns() }
    await vi.advanceTimersByTimeAsync(grace - 1); expect(resolved).toBe(false)
    expect(host.kill.mock.calls).toEqual([[42, 'SIGTERM'], [42, 'SIGTERM']])
    await vi.advanceTimersByTimeAsync(1); await pending
    expect(host.kill.mock.calls).toEqual(mode === 'closed' ? [[42, 'SIGTERM'], [42, 'SIGTERM']] : [[42, 'SIGTERM'], [42, 'SIGTERM'], [42, 'SIGKILL']])
    if (mode !== 'closed') h.child.emit('close', 0)
    await turns(); expect(resultOf(h).result).toEqual({ type: 'cancelled' })
  })
  it('spawns after cancel before preflight and does not replay the abort listener', async () => {
    const h = setup(); const run = h.executor.run(ctx, h.callbacks); const cancel = run.cancel(1)
    expect(host.kill.mock.calls).toEqual([[undefined, 'SIGTERM']]); await turns()
    expect(host.spawn).toHaveBeenCalledTimes(1); expect(h.trace[0]).toEqual(['spawn', { taskId: 'task', attemptId: 'attempt', pid: 42, pidStartedAt: null, kind: 'ffmpeg', spawnedAt: 1000 }])
    expect(host.kill.mock.calls).toEqual([[undefined, 'SIGTERM']]); h.child.emit('close', 0); await turns(); await vi.advanceTimersByTimeAsync(1); await cancel
    expect(resultOf(h).result).toEqual({ type: 'cancelled' })
  })
})

describe('audit DRM asynchronous routing', () => {
  it.each(['rawMessage', 'stderrTail', 'stdoutTail', 'split', 'success', 'non-drm', 'default-unavailable'])('pins %s detection, identity and control ownership', async (source) => {
    const trace: unknown[] = []; let deliver!: ExecutorEvents['onFinish']
    const control = (name: string): ExecutorRun => ({ cancel: async (n) => { trace.push([name, 'cancel', n]) }, pause: async () => { trace.push([name, 'pause']) } })
    const primary: Executor = { run(_ctx, events) { deliver = events.onFinish; return control('primary') } }
    const callbacks: ExecutorEvents = { onSpawn() {}, onProgress() {}, onStd: (e) => { trace.push(['std', e]) }, onFinish: (e) => { trace.push(['finish', e]) } }
    const capture: Executor = { run(context, events) { expect(context).toBe(ctx); expect(events).toBe(callbacks); trace.push('capture'); return control('capture') } }
    if (source === 'default-unavailable') host.available = false
    const wrapper = source === 'default-unavailable' ? new DrmFallbackExecutor(primary, capture) : new DrmFallbackExecutor(primary, capture, () => true)
    const run = wrapper.run(ctx, callbacks)
    const value = finish('other')
    if (value.result.type !== 'error') throw new Error('fixture error')
    if (source === 'rawMessage' || source === 'default-unavailable') value.result.error.rawMessage = 'DRM protected'
    if (source === 'stderrTail' || source === 'stdoutTail') value[source] = 'DRM protected'
    if (source === 'split') { value.result.error.rawMessage = 'drm'; value.stderrTail = ' protected' }
    if (source === 'success') value.result = { type: 'success', output: { filePath: '/fixture/result.mp4', size: 3, durationMs: null, sha256: null } }
    queueMicrotask(() => deliver(value)); await turns()
    const captured = ['rawMessage', 'stderrTail', 'stdoutTail'].includes(source)
    expect(trace).toEqual(captured ? [['std', { taskId: 'task', attemptId: 'attempt', stream: 'stderr', line: DRM_FALLBACK_MESSAGE }], 'capture'] : [['finish', value]])
    if (captured) { deliver(value); expect(trace.at(-1)).toEqual(['finish', value]); expect(trace.filter((row) => row === 'capture')).toHaveLength(1) }
    await run.cancel(3); await run.pause(); expect(trace.slice(-2)).toEqual([[captured ? 'capture' : 'primary', 'cancel', 3], [captured ? 'capture' : 'primary', 'pause']])
  })
})

it('forwards browser preference to platform probes and derives canvas from the public constant', async () => {
  const h = setup(); h.executor.run({ ...ctx, input: { ...ctx.input, options: { settings: { browserForCookies: 'chrome:Default' } } } }, h.callbacks)
  host.paths.length = 0
  await turns()
  expect(host.paths.slice(0, 4)).toEqual(['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chrome', '/opt/google/chrome/chrome'])
  const job = JSON.parse(host.write.mock.calls[0]![1]); expect({ width: job.width, height: job.height }).toEqual(VIRTUAL_DISPLAY_SIZE)
  h.child.emit('close', 1); await turns()
})
