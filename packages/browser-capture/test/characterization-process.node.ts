import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { NODE } from './fixtures/node-runtime.js'

type Observation = { site: string; event: string; pid?: number; kind?: string; bytes?: number | number[]; waitingDrain?: boolean; drains?: number; eof?: boolean; readableEnded?: boolean; stdio?: string | string[] }
const trace = (root: string): Observation[] => existsSync(join(root, 'control.jsonl')) ? readFileSync(join(root, 'control.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
async function until(predicate: () => boolean, description: string, ms = 15_000) {
  const deadline = performance.now() + ms
  while (!predicate()) { assert.ok(performance.now() < deadline, description); await delay(10) }
}
async function run(site: 'pactl' | 'recorder', drained: boolean) {
  const root = mkdtempSync(join(tmpdir(), `vidbee-real-${site}-`))
  let child: ChildProcess | undefined
  let stdout = ''
  let stderr = ''
  let closed = false
  let exit: number | null = null
  let killedForCleanup = false
  let originalFailure: unknown
  try {
    const job = join(root, 'job.json')
    const output = join(root, 'output.mp4')
    writeFileSync(job, JSON.stringify({ url: 'https://fixture.invalid/video', outputPath: output, ffmpegPath: '/fixture/ffmpeg', browserExecutable: '/fixture/chromium', width: 4, height: 4, durationHintSec: 2 }))
    const program = `process.argv=['node','sidecar','--job',${JSON.stringify(job)}];await import('@vidbee/browser-capture/sidecar')`
    child = spawn(NODE, ['--import', 'tsx', '--import', new URL('./fixtures/sidecar-real-process-driver.mjs', import.meta.url).href, '--input-type=module', '-e', program], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VIDBEE_PROCESS_ROOT: root, VIDBEE_PROCESS_SITE: site, VIDBEE_PROCESS_DRAIN: drained ? '1' : '0' }
    })
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('close', (code) => { closed = true; exit = code })
    child.on('error', (error) => { throw error })
    if (!drained) {
      await until(() => trace(root).some((row) => row.site === site && row.event === 'backpressure'), `${site} did not reach real-pipe backpressure`)
      assert.equal(trace(root).some((row) => row.site === site && row.event === 'complete'), false)
      writeFileSync(join(root, `${site}.inspect`), 'inspect')
      await until(() => trace(root).some((row) => row.site === site && row.event === 'inspection'), `${site} did not acknowledge control request`)
      const inspection = trace(root).find((row) => row.site === site && row.event === 'inspection')
      assert.ok(inspection); assert.equal(inspection.waitingDrain, true)
      assert.ok(typeof inspection.bytes === 'number' && inspection.bytes < 16 * 1024 * 1024)
      if (site === 'pactl') {
        assert.equal(closed, false)
        assert.equal(stdout.includes('Virtual display'), false, 'capture must remain blocked in unread pactl stderr')
        killedForCleanup = true
      }
    }
    if (!killedForCleanup) {
      await until(() => closed, 'sidecar did not finish after its controlled child')
      assert.equal(exit, 0, stdout + stderr); assert.equal(stderr, '')
      assert.ok(stdout.includes('"type":"done"'))
    }
    const observations = trace(root)
    const selected = observations.filter((row) => row.site === site)
    const complete = selected.find((row) => row.event === 'complete')
    if (drained) { assert.equal(complete?.bytes, 16 * 1024 * 1024); assert.ok(observations.some((row) => row.event === 'control-drain')); assert.equal(observations.find((row) => row.event === 'control-bytes')?.bytes, 16 * 1024 * 1024) }
    else assert.equal(complete, undefined)
    if (site === 'recorder') {
      const stdin = selected.find((row) => row.event === 'stdin')
      assert.deepEqual(stdin?.bytes, [113]); assert.equal(stdin.eof, false); assert.equal(stdin.readableEnded, false)
      assert.ok(selected.some((row) => row.event === 'q-without-eof' && row.eof === false && row.readableEnded === false))
      assert.equal(selected.some((row) => row.event === 'eof'), false)
    }
    return { drained, blocked: !drained, completedBytes: complete?.bytes ?? null, qWithoutEof: site === 'recorder', consumedControlBytes: observations.find((row) => row.event === 'control-bytes')?.bytes ?? null, ownedChildren: observations.filter((row) => row.event === 'owned-child').length, observations: selected.filter((row) => row.event !== 'backpressure').map(({ pid: _pid, ...row }) => row), backpressureObservations: selected.filter((row) => row.event === 'backpressure').length }
  } catch (error) { originalFailure = error; throw error } finally {
    try {
    // Every PID came from this preload's actualSpawn result. No group/broad kills.
    if (child && !closed) child.kill('SIGKILL')
    const ownedPids = trace(root).filter((row) => row.event === 'owned-child' && row.pid).map((row) => row.pid).filter((pid): pid is number => pid !== undefined)
    const stillOwned = (pid: number) => {
      try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(root) }
      catch { return false }
    }
    for (const pid of ownedPids) if (stillOwned(pid)) {
      try { process.kill(pid, 'SIGKILL') } catch { /* Already reaped by its owning sidecar. */ }
    }
    if (child && !closed) await until(() => closed, 'owned sidecar did not exit during cleanup', 20000)
    await until(() => ownedPids.every((pid) => !stillOwned(pid)), 'owned child remained alive after cleanup', 20000)
    } catch (error) { if (!originalFailure) throw error } finally { rmSync(root, { recursive: true, force: true }) }
  }
}

for (const site of ['pactl', 'recorder'] as const) test(`public sidecar real ${site} unread pipe blocks; drained control completes`, { timeout: 60_000 }, async (context) => {
  const unread = await run(site, false)
  const drained = await run(site, true)
  assert.equal(unread.blocked, true); assert.equal(unread.completedBytes, null)
  assert.equal(drained.blocked, false); assert.equal(drained.completedBytes, 16 * 1024 * 1024)
  assert.equal(unread.qWithoutEof, site === 'recorder'); assert.equal(drained.qWithoutEof, site === 'recorder')
  context.diagnostic(JSON.stringify({ site, unread, drained }))
})
