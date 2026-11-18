import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GalleryDlExecutor, YtDlpExecutor } from '@vidbee/downloader-core'
import { resolveYtDlpWrapCtor } from '@vidbee/downloader-core/yt-dlp-wrap'
import WrapperImport from 'yt-dlp-wrap-plus'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '@vidbee/task-queue-legacy'
import { NODE } from './fixtures/node-runtime'

const Wrapper = resolveYtDlpWrapCtor<typeof WrapperImport>(WrapperImport)
function compareTrace(name: string, trace: unknown[], root: string) {
  const file = new URL(`./fixtures/process-${name}.json`, import.meta.url)
  const normalized = JSON.parse(JSON.stringify(trace).split(root).join('<ROOT>'))
  if (process.env.VIDBEE_RECORD_CHARACTERIZATION === '1') writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n')
  assert.deepEqual(normalized, JSON.parse(readFileSync(file, 'utf8')))
}
const context: ExecutorContext = { taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url: 'https://fixture.invalid/video' } }
function fixture(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-process-oracle-')); const file = join(dir, 'fixture.cjs')
  writeFileSync(file, `#!${NODE}\n${body}\n`, { mode: 0o755 }); return { dir, file }
}
const events = (trace: unknown[], finish: (e: ExecutorFinishEvent) => void): ExecutorEvents => ({
  onSpawn: (e) => trace.push(['spawn', { ...e, pid: e.pid > 0 ? '<PID>' : e.pid }]),
  onProgress: (e) => trace.push(['progress', e]), onProcessing: (e) => trace.push(['processing', e]), onStd: (e) => trace.push(['std', e]), onFinish: (e) => { trace.push(['finish', e]); finish(e) }
})

test('Node oracle prerequisite is explicit and pinned', () => { assert.equal(process.version, 'v22.23.4'); assert.equal(process.execPath, NODE) })
for (const code of [0, 7, null]) test(`real wrapper completion Node code ${code}`, { timeout: 5000 }, async (t) => {
  const { dir, file } = fixture(code === null ? "process.kill(process.pid,'SIGTERM')" : `process.stderr.write('full stderr');process.exitCode=${code}`)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const proc = new Wrapper(file).exec([]); t.after(() => proc.ytDlpProcess?.kill('SIGKILL')); const trace: unknown[] = []
  const outcome = await new Promise<{ kind: string; message?: string; code?: number | null }>((resolve) => {
    proc.on('error', (error) => { trace.push('error'); resolve({ kind: 'error', message: error.message }) }); proc.on('close', (code) => { trace.push('close'); resolve({ kind: 'close', code }) })
  })
  assert.deepEqual(trace, [code === 0 ? 'close' : 'error'])
  assert.deepEqual(outcome, code === 0 ? { kind: 'close', code: 0 } : { kind: 'error', message: `\nError code: ${code}${code === null ? '' : '\n\nStderr:\nfull stderr'}` })
})
test('wrapper oracle parses each chunk independently, progress before ytDlpEvent before user stdout', { timeout: 5000 }, async (t) => {
  const { dir, file } = fixture("setInterval(()=>{},1000)"); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const proc = new Wrapper(file).exec([]); t.after(() => proc.ytDlpProcess?.kill('SIGKILL')); const trace: unknown[] = []
  proc.on('progress', (v) => trace.push(['progress', v])); proc.on('ytDlpEvent', (kind, data) => trace.push(['event', kind, data])); proc.on('error', () => {})
  const stdout = proc.ytDlpProcess?.stdout; assert.ok(stdout)
  stdout.on('data', (v: Buffer) => trace.push(['stdout', v.toString()]))
  const input = '[download] 50.0% of 10MiB at 1MiB/s ETA 00:05\r[Merger] combine\n'
  stdout.emit('data', Buffer.from(input))
  assert.deepEqual(trace, [
    ['progress', { percent: 50, totalSize: '10MiB', currentSpeed: '1MiB/s', eta: '00:05' }], ['event', 'download', ' 50.0% of 10MiB at 1MiB/s ETA 00:05'], ['event', 'Merger', ' combine'], ['stdout', input]
  ])
  trace.length = 0; stdout.emit('data', Buffer.from('[download] 5')); stdout.emit('data', Buffer.from('0% of 10MiB\n'))
  assert.deepEqual(trace.map((v) => Array.isArray(v) ? v[0] : v), ['event', 'stdout', 'stdout'])
  const failure = new Error('callback identity'); proc.on('progress', () => { throw failure }); trace.length = 0
  assert.throws(() => stdout.emit('data', Buffer.from(input)), (e) => e === failure)
  assert.equal(trace.length, 1)
  const done = new Promise((resolve) => proc.once('close', resolve)); proc.ytDlpProcess?.kill('SIGKILL'); await done
})
test('wrapper raw error is delayed to close and full stderr is included verbatim', { timeout: 5000 }, async (t) => {
  const { dir, file } = fixture("setInterval(()=>{},1000)"); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const proc = new Wrapper(file).exec([]); const child = proc.ytDlpProcess; assert.ok(child); t.after(() => child.kill('SIGKILL'))
  const failure = new Error('original raw failure'); const text = 'z'.repeat(9000); const trace: string[] = []
  proc.on('error', (e) => trace.push(e.message)); child.stderr?.emit('data', Buffer.from(text)); child.emit('error', failure)
  assert.deepEqual(trace, [])
  // Manually observe the wrapper's complete conversion, then reap our owned real child.
  child.emit('close', 7, null)
  assert.deepEqual(trace, [`\nError code: 7\n\nProcess error:\nError: original raw failure\n\nStderr:\n${text}`])
  child.kill('SIGKILL')
})
for (const preAbort of [false, true]) test(`Node second-argument AbortSignal killed-state oracle, pre-aborted=${preAbort}`, { timeout: 5000 }, async (t) => {
  const { dir, file } = fixture("setInterval(()=>{},1000)"); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const controller = new AbortController(); if (preAbort) controller.abort()
  const proc = new Wrapper(file).exec([], { signal: controller.signal }); const child = proc.ytDlpProcess; assert.ok(child)
  let original: unknown; child.on('error', (e) => { original = e })
  const outcome = new Promise<number | null>((resolve, reject) => { proc.on('close', resolve); proc.on('error', reject) })
  if (!preAbort) controller.abort()
  assert.equal(await outcome, null)
  assert.equal(child.killed, true)
  assert.ok(original instanceof Error); assert.equal(original.name, 'AbortError')
})
for (const kind of ['yt', 'gallery'] as const) {
  for (const scenario of ['success', 'nonzero', 'signal', 'missing', 'cancel', 'ignore-term'] as const) test(`${kind} Node executable full callback trace: ${scenario}`, { timeout: 5000 }, async (t) => {
    const { dir, file } = fixture(scenario === 'signal' ? "process.kill(process.pid,'SIGTERM')" : scenario === 'cancel' || scenario === 'ignore-term' ? `${scenario === 'ignore-term' ? "process.on('SIGTERM',()=>{});" : ''}process.stdout.write('ready\\n');setInterval(()=>{},1000)` : `process.stdout.write('ordinary\\n');const timer=setInterval(()=>{if(require('node:fs').existsSync(require('node:path').join(__dirname,'stdout-seen'))){clearInterval(timer);process.stderr.write('diagnostic\\n');process.exitCode=${scenario === 'nonzero' ? 7 : 0}}},1)`)
    t.after(() => rmSync(dir, { recursive: true, force: true })); const trace: unknown[] = []
    const executor = kind === 'yt' ? new YtDlpExecutor({ resolveYtDlpPath: () => scenario === 'missing' ? join(dir, 'absent') : file, resolveFfmpegLocation: () => dir, defaultDownloadDir: dir, clock: () => 1000, buildArgs: () => ['url'], killGraceMs: 20 }) : new GalleryDlExecutor({ resolveBinaryPath: () => scenario === 'missing' ? join(dir, 'absent') : file, defaultDownloadDir: dir, clock: () => 1000, killGraceMs: 20 })
    let finish: (e: ExecutorFinishEvent) => void = () => {}; const done = new Promise<ExecutorFinishEvent>((resolve) => { finish = resolve })
    const callback = events(trace, finish); let run: ReturnType<typeof executor.run>; let ownedPid = -1
    const onSpawn = callback.onSpawn; callback.onSpawn = (e) => { ownedPid = e.pid; onSpawn(e) }
    t.after(() => { if (ownedPid > 0) { try { process.kill(-ownedPid, 'SIGKILL') } catch {} } })
    callback.onStd = (e) => { trace.push(['std', e]); if (e.line === 'ordinary') writeFileSync(join(dir, 'stdout-seen'), 'ack'); if (e.line === 'ready') { void run.cancel(); void run.cancel(); } }
    run = executor.run(kind === 'yt' ? context : { ...context, input: { kind: 'vsco-gallery', url: 'https://vsco.co/fixture/gallery' } }, callback)
    assert.equal(Array.isArray(trace[0]) ? trace[0][0] : '', 'spawn')
    if (scenario === 'missing') assert.equal((trace[0] as [string, { pid: number }])[1].pid, -1)
    const result = await done
    assert.equal(result.result.type, scenario === 'cancel' || scenario === 'ignore-term' ? 'cancelled' : scenario === 'success' && kind === 'yt' ? 'success' : 'error')
    assert.equal(trace.filter((v) => Array.isArray(v) && v[0] === 'finish').length, 1)
    assert.equal((trace.at(-1) as [string])[0], 'finish')
    if (scenario === 'success' && result.result.type === 'success') assert.equal(result.result.output.size, 0) // no output file still executor success
    compareTrace(`${kind}-${scenario}`, trace, dir)
    if (scenario === 'nonzero') assert.equal(result.result.type === 'error' ? result.result.exitCode : undefined, kind === 'yt' ? null : 7)
  })
}

for (const kind of ['yt', 'gallery'] as const) test(`${kind} leader exits while descendant retains pipes; cancellation still reaches owned group`, { timeout: 5000 }, async (t) => {
  const { dir, file } = fixture(`require('node:child_process').spawn(${JSON.stringify(NODE)},['-e',${JSON.stringify("process.stdout.write('descendant-ready\\n');setInterval(()=>{},1000)")}],{stdio:['ignore','inherit','inherit']}).unref();process.exit(0)`)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let pid = -1; let ready: () => void = () => {}; const started = new Promise<void>((resolve) => { ready = resolve }); let finished = false
  let finish: (e: ExecutorFinishEvent) => void = () => {}; const done = new Promise<ExecutorFinishEvent>((resolve) => { finish = resolve })
  const executor = kind === 'yt' ? new YtDlpExecutor({ resolveYtDlpPath: () => file, resolveFfmpegLocation: () => dir, defaultDownloadDir: dir, buildArgs: () => ['url'] }) : new GalleryDlExecutor({ resolveBinaryPath: () => file, defaultDownloadDir: dir })
  const run = executor.run(kind === 'yt' ? context : { ...context, input: { kind: 'vsco-gallery', url: 'https://vsco.co/fixture/gallery' } }, { onSpawn: (e) => { pid = e.pid }, onProgress() {}, onStd: (e) => { if (e.line === 'descendant-ready') ready() }, onFinish: (e) => { finished = true; finish(e) } })
  t.after(() => { try { process.kill(-pid, 'SIGKILL') } catch {} })
  await started
  for (let i = 0; i < 100; i++) { try { process.kill(pid, 0) } catch { break }; await new Promise((resolve) => setTimeout(resolve, 5)) }
  assert.throws(() => process.kill(pid, 0)); assert.equal(finished, false)
  await run.cancel(0); assert.equal((await done).result.type, 'cancelled')
})
test('real wrapper abort from progress callback stops child and preserves event/stdout order', { timeout: 5000 }, async (t) => {
  const { dir, file } = fixture("process.stdout.write('[download] 50% of 10MiB at 1MiB/s ETA 00:05\\n');setInterval(()=>{},1000)"); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const controller = new AbortController(); const proc = new Wrapper(file).exec([], { signal: controller.signal }); t.after(() => proc.ytDlpProcess?.kill('SIGKILL'))
  const trace: string[] = []; proc.on('progress', () => { trace.push('progress'); controller.abort(); trace.push('abort-return') }); proc.on('ytDlpEvent', () => trace.push('event')); proc.ytDlpProcess?.stdout?.on('data', () => trace.push('std'))
  await new Promise((resolve, reject) => { proc.on('close', resolve); proc.on('error', reject) })
  assert.deepEqual(trace, ['progress', 'abort-return', 'event', 'std']); assert.equal(proc.ytDlpProcess?.killed, true)
})
