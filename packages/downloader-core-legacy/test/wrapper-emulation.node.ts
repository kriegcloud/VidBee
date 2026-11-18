import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import WrapperImport from 'yt-dlp-wrap-plus'
import { resolveYtDlpWrapCtor } from '../src/yt-dlp-wrap'
import { advanceWrapper, initialWrapperState } from '../../downloader-core/src/YtDlpWrapper'
import type { ProcessEvent } from '../../downloader-core/src/Process.model'
import { NODE } from './fixtures/node-runtime'

const Wrapper = resolveYtDlpWrapCtor<typeof WrapperImport>(WrapperImport)
for (const scenario of ['missing', 'pre-aborted', 'abort-in-progress', 'abort-in-std', 'nonzero', 'success'] as const) {
  test(`pinned Node wrapper and emulation differential: ${scenario}`, { timeout: 5000 }, async t => {
    assert.equal(process.version, 'v22.23.4')
    assert.equal(process.execPath, NODE)
    const root = mkdtempSync(join(tmpdir(), 'vidbee-wrapper-differential-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const binary = join(root, 'fixture.cjs')
    writeFileSync(binary, `#!${NODE}\n${scenario === 'pre-aborted' || scenario === 'abort-in-progress' || scenario === 'abort-in-std'
      ? "process.stdout.write('[download]  50% of 10MiB at 1MiB/s ETA 00:01\\n');setInterval(()=>{},1000)"
      : `process.stdout.write('[download]  100% of 5B\\n[Merger] done\\n'); process.stderr.write('full stderr'); process.exitCode=${scenario === 'nonzero' ? 7 : 0}`}
`, { mode: 0o755 })
    const controller = new AbortController()
    if (scenario === 'pre-aborted') controller.abort()
    const emitter = new Wrapper(scenario === 'missing' ? join(root, 'missing') : binary).exec([], { signal: controller.signal })
    const child = emitter.ytDlpProcess
    assert.ok(child)
    t.after(() => { try { child.kill('SIGKILL') } catch {} })
    const oracle: unknown[] = []
    const emulated: unknown[] = []
    let state = initialWrapperState()
    let rawError: unknown
    const observe = (event: ProcessEvent) => {
      const next = advanceWrapper({ state, event }); state = next.state
      for (const value of next.observations) {
        if (value._tag === 'progress') emulated.push(['progress', value.payload])
        else if (value._tag === 'ytDlpEvent') emulated.push(['event', value.eventType, value.eventData])
        else if (value._tag === 'error') emulated.push(['error', value.error instanceof Error ? value.error.name : '', value.error instanceof Error ? value.error.message : String(value.error)])
        else if (value._tag === 'close') emulated.push(['close', value.code])
        else emulated.push([value._tag, Buffer.from(value.chunk).toString()])
      }
    }
    emitter.on('progress', payload => { oracle.push(['progress', payload]); if (scenario === 'abort-in-progress') controller.abort() })
    emitter.on('ytDlpEvent', (event, data) => oracle.push(['event', event, data]))
    emitter.on('error', error => oracle.push(['error', error.name, error.message]))
    emitter.on('close', code => oracle.push(['close', code]))
    child.stdout?.on('data', (chunk: Buffer) => { oracle.push(['stdout', chunk.toString()]); if (scenario === 'abort-in-std') controller.abort(); observe({ _tag: 'stdout', chunk }) })
    child.stderr?.on('data', (chunk: Buffer) => { oracle.push(['stderr', chunk.toString()]); observe({ _tag: 'stderr', chunk }) })
    child.on('error', error => { rawError = error; observe({ _tag: 'rawError', error }); assert.equal(state.processError, error) })
    const completion = await new Promise<{ code: number | null; signal: string | null; killed: boolean }>(resolve => child.on('close', (code, signal) => {
      const killed = child.killed
      observe({ _tag: 'complete', outcome: { _tag: 'Raw', code, signal, killed } })
      resolve({ code, signal, killed })
    }))
    assert.deepEqual(emulated, oracle)
    if (scenario === 'missing') { assert.equal(child.pid, undefined); assert.ok(rawError instanceof Error); assert.equal(state.processError, rawError) }
    if (scenario === 'pre-aborted' || scenario === 'abort-in-progress' || scenario === 'abort-in-std') { assert.equal(completion.killed, true); assert.equal(completion.code, null); assert.equal(rawError instanceof Error ? rawError.name : '', 'AbortError') }
    if (scenario === 'nonzero') assert.deepEqual(oracle.at(-1), ['error', 'Error', '\nError code: 7\n\nStderr:\nfull stderr'])
  })
}
