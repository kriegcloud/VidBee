import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YtDlpExecutor, type YtDlpExecutorOptions } from '@vidbee/downloader-core-legacy'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '@vidbee/task-queue-legacy'

const ctx: ExecutorContext = { taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url: 'https://fixture.invalid/watch' } }
const roots: string[] = []
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function setup(options: Partial<YtDlpExecutorOptions> = {}, context = ctx) {
  const streams = { stdout: new PassThrough(), stderr: new PassThrough() }
  const emitter = Object.assign(new EventEmitter(), { ytDlpProcess: { ...streams, kill: () => true } })
  const trace: unknown[] = []
  const args: string[][] = []
  const events: ExecutorEvents = {
    onSpawn: (e) => trace.push(['spawn', e]), onProgress: (e) => trace.push(['progress', e]),
    onProcessing: (e) => trace.push(['processing', e]), onStd: (e) => trace.push(['std', e]), onFinish: (e) => trace.push(['finish', e])
  }
  const executor = new YtDlpExecutor({ resolveYtDlpPath: () => '/fixture/yt-dlp', resolveFfmpegLocation: () => '/fixture/ffmpeg', defaultDownloadDir: '/fixture/out', clock: () => 1000, spawnFn: (_bin, argv) => { args.push([...argv]); return emitter }, ...options })
  const run = executor.run(context, events)
  return { trace, args, emitter, streams, run, executor, events }
}

describe('old executor synchronous callback boundary', () => {
  it('records state immediately after every emission, then synchronous finish, exactly once', () => {
    const { trace, emitter, streams } = setup()
    const observations: unknown[] = [['run-return', structuredClone(trace)]]
    const emit = (target: EventEmitter, event: string, value: unknown) => { target.emit(event, value); observations.push([event, structuredClone(trace)]) }
    emit(emitter, 'progress', { percent: 50, totalSize: '10MiB', currentSpeed: '1MiB/s', eta: '00:05' })
    emit(streams.stdout, 'data', Buffer.from('[Mer'))
    emit(streams.stderr, 'data', Buffer.from('warning\r\n'))
    emit(streams.stdout, 'data', Buffer.from('ger] combine\rnext\n'))
    emit(emitter, 'progress', { percent: 10, totalSize: '2MiB' })
    emit(emitter, 'close', 0)
    emit(emitter, 'close', 7)
    expect(observations).toMatchSnapshot()
  })
  it.each([null, 7])('injected close(%s) is passed directly through without wrapper conversion', (code) => {
    const { trace, emitter } = setup()
    emitter.emit('close', code)
    expect(trace).toMatchSnapshot()
  })
  it('no child emitter supports progress, original error message, and finish once', () => {
    const emitter = new EventEmitter()
    const state = setup({ spawnFn: () => emitter })
    emitter.emit('progress', { percent: 40 })
    emitter.emit('error', new Error('original-injected-error'))
    emitter.emit('close', 0)
    expect(state.trace).toMatchSnapshot()
  })
  it('callback exception escapes emission and prevents later listener work', () => {
    const state = setup()
    const failure = { failure: 'opaque callback' }
    const executor = new YtDlpExecutor({ resolveYtDlpPath: () => 'x', resolveFfmpegLocation: () => 'ff', defaultDownloadDir: '/fixture', spawnFn: () => state.emitter })
    executor.run(ctx, { ...state.events, onProgress() { throw failure } })
    expect(() => state.emitter.emit('progress', { percent: 10 })).toThrow(failure)
  })
  it.each(['builder', 'binary', 'ffmpeg', 'spawn'] as const)('preflight %s finishes before run returns', (site) => {
    const fail = () => { throw 'opaque-failure' }
    const state = setup(site === 'builder' ? { buildArgs: fail } : site === 'binary' ? { resolveYtDlpPath: fail } : site === 'ffmpeg' ? { resolveFfmpegLocation: () => undefined } : { spawnFn: fail })
    expect(state.trace).toMatchSnapshot()
  })
  it('FFmpeg resolver is outside the preflight catch', () => {
    const failure = { thrown: 'ffmpeg' }
    expect(() => setup({ resolveFfmpegLocation() { throw failure } })).toThrow(failure)
  })
  it('custom builder wins over raw args and extras; FFmpeg goes before final element', () => {
    const state = setup({ buildArgs: () => ['--custom', 'final'], extraArgs: () => ['--ignored'] }, { ...ctx, input: { ...ctx.input, rawArgs: ['--raw', 'raw-url'] } })
    expect(state.args).toEqual([['--custom', '--ffmpeg-location', '/fixture/ffmpeg', 'final']])
    const raw = setup({ extraArgs: () => ['--ignored'] }, { ...ctx, input: { ...ctx.input, rawArgs: ['--raw', 'raw-url'] } })
    expect(raw.args).toEqual([['--raw', '--ffmpeg-location', '/fixture/ffmpeg', 'raw-url']])
  })
  it('raw empty argv uses default builder; describe omits FFmpeg and preparation', () => {
    let prepared = 0
    const state = setup({ prepareSettings: async () => { prepared++; return {} } })
    expect(state.executor.describeCommandFor(ctx.input)).not.toContain('--ffmpeg-location')
    expect(prepared).toBe(1)
  })
  it('settings preparation rejection and cancellation are distinct microtask sequences', async () => {
    const markers: unknown[] = []
    const state = setup({ prepareSettings: () => Promise.reject('settings-failure') })
    markers.push(['returned', structuredClone(state.trace)])
    queueMicrotask(() => markers.push(['marker', structuredClone(state.trace)]))
    await Promise.resolve()
    markers.push(['await', structuredClone(state.trace)])
    expect(markers).toMatchSnapshot()
  })
  it('cancel before settings completion silently suppresses launch and finish', async () => {
    let release: (v: undefined) => void = () => {}
    const prepared = new Promise<undefined>((resolve) => { release = resolve })
    const state = setup({ prepareSettings: () => prepared })
    await state.run.cancel(0)
    release(undefined)
    await Promise.resolve()
    expect(state.trace).toEqual([])
    expect(state.args).toEqual([])
  })
  it('prepareSettings synchronous throws escape run by identity', () => {
    const failure = { settings: 'throw' }
    expect(() => setup({ prepareSettings() { throw failure } })).toThrow(failure)
  })
  it('pause and repeated cancel acknowledge before close and replace escalation timer', async () => {
    vi.useFakeTimers()
    const state = setup({ killGraceMs: 100 })
    await state.run.pause()
    expect(vi.getTimerCount()).toBe(1)
    await state.run.cancel(200)
    expect(vi.getTimerCount()).toBe(1)
    expect(state.trace.length).toBe(1)
    vi.advanceTimersByTime(200)
    state.emitter.emit('close', null)
    expect(state.trace).toMatchSnapshot()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('subtitle-only close retries once with same attempt, no second spawn, explicit opt-outs', () => {
    const processes: ReturnType<typeof setup>['emitter'][] = []
    const argv: string[][] = []
    const state = setup({ spawnFn: (_bin, args) => {
      argv.push([...args]); const e = Object.assign(new EventEmitter(), { ytDlpProcess: { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true } }); processes.push(e); return e
    } })
    processes[0]?.ytDlpProcess.stderr.emit('data', Buffer.from('Unable to download video subtitles for en\n'))
    processes[0]?.emit('close', 1)
    expect(processes).toHaveLength(2)
    expect(argv[1]?.slice(-6)).toEqual(['--ffmpeg-location', '/fixture/ffmpeg', '--no-write-subs', '--no-write-auto-subs', '--no-embed-subs', ctx.input.url])
    processes[1]?.emit('close', 0)
    expect(state.trace).toMatchSnapshot()
  })
  it('path, format and subtitle signals outlive 8192-character tails; independent chunk UTF-8 is lossy', () => {
    const root = mkdtempSync(join(tmpdir(), 'vidbee-signals-')); roots.push(root)
    const file = join(root, 'out.mp4'); writeFileSync(file, 'media')
    const state = setup()
    state.streams.stdout.emit('data', Buffer.from(`[info] fixture: Downloading 1 format(s): 137+140\n__VIDBEE_OUTPUT_PATH__:${file}\n[info] Downloading subtitles: en, fr\nVIDBEE_DURATION:1.25\nVIDBEE_VISIBILITY:private\n`))
    state.streams.stdout.emit('data', Buffer.from('x'.repeat(40000)))
    state.streams.stderr.emit('data', Buffer.from('y'.repeat(10000)))
    state.streams.stdout.emit('data', Buffer.from([0xe2]))
    state.streams.stdout.emit('data', Buffer.from([0x82, 0xac]))
    state.emitter.emit('close', 0)
    const event = state.trace.at(-1) as [string, ExecutorFinishEvent]
    expect(event[1].stdoutTail).toBe('x'.repeat(8189) + '���')
    expect(event[1].stderrTail).toBe('y'.repeat(8192))
    expect(event[1].result.type).toBe('success')
    if (event[1].result.type === 'success') expect({ ...event[1].result.output, filePath: '<FILE>' }).toMatchSnapshot()
  })
})

it('multi-stream aggregation, sidecars, changing totals and false positives through public executor', () => {
  const state = setup()
  for (const payload of [{ percent: 100, totalSize: '12KiB' }, { percent: 10, totalSize: '100MiB' }, { percent: 80, totalSize: '100MiB' }, { percent: 100, totalSize: '100MiB' }, { percent: 5, totalSize: '10MiB' }, { percent: 50, totalSize: '10MiB' }, { percent: 100, totalSize: '10MiB' }, { percent: 100, totalSize: '3KiB' }, { percent: Number.NaN }, { percent: -1 }, { percent: 200, totalSize: 'unknown', downloaded: '15MiB', eta: '1:02:03', currentSpeed: 'Unknown' }]) state.emitter.emit('progress', payload)
  expect(state.trace).toMatchSnapshot()
})
for (const line of ['Merging formats into "/fixture/merged.mp4"', 'Destination: "/fixture/quoted.mp4"', "Destination: '/fixture/single.mp4'", '[download] /fixture/existing.mp4 has already been downloaded', '[MoveFiles] Moving file "old" to "/fixture/moved.mp4"', '[EmbedSubtitle] Writing "/fixture/subbed.mp4"', '[ExtractAudio] Converting to "/fixture/audio.mp3"', 'Destination: /fixture/unquoted.mp4']) it(`saved path extraction public close: ${line}`, () => {
  const state = setup(); state.streams.stdout.emit('data', Buffer.from(line + '\n')); state.emitter.emit('close', 0)
  expect(state.trace.at(-1)).toMatchSnapshot()
})
it('subtitle unavailable and auth-skipped outcomes differ', () => {
  const unavailable = setup(); unavailable.streams.stdout.emit('data', Buffer.from('There are no subtitles for the requested languages\n')); unavailable.emitter.emit('close', 0)
  const skipped = setup({}, { ...ctx, input: { ...ctx.input, url: 'https://www.bilibili.com/video/BVfixture' } }); skipped.emitter.emit('close', 0)
  expect([unavailable.trace.at(-1), skipped.trace.at(-1)]).toMatchSnapshot()
})
