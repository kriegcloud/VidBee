import assert from 'node:assert/strict'
import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Option from 'effect/Option'
import * as Scope from 'effect/Scope'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { ProcessCapabilities } from '../../downloader-core/src/ProcessCapabilities.service'
import { makeProcessCapabilitiesLayer } from '../src/Process.layer'
import type { HostFailure } from '../../downloader-core/src/Downloader.errors'
import type { ProcessCapabilitiesSpec } from '../../downloader-core/src/ProcessCapabilities.model'
import type { ProcessEvent } from '../../downloader-core/src/Process.model'

const unwrap = (cause: Cause.Cause<HostFailure>) => {
  const error = Cause.findErrorOption(cause)
  return Option.isSome(error) ? error.value.cause ?? error.value : Cause.squash(cause)
}
const spec: ProcessCapabilitiesSpec = { command: 'fixture', argv: [], env: undefined, extendEnv: false,
  cwd: undefined, detached: true, windowsHide: true, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  stdoutConsumption: 'unread', stderrConsumption: 'deliver' }

test('raw live signalling observes killed while alive; writes/callbacks stay synchronous and reap means close', { timeout: 30000 }, async () => {
  const child = new ChildProcess()
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  Object.defineProperties(child, { pid: { value: 42 }, stdin: { value: stdin }, stdout: { value: stdout }, stderr: { value: stderr } })
  const calls: string[] = []
  child.kill = signal => { calls.push(String(signal)); Object.defineProperty(child, 'killed', { value: true, configurable: true }); return true }
  let runtime: ManagedRuntime.ManagedRuntime<ProcessCapabilities, never>
  runtime = ManagedRuntime.make(makeProcessCapabilitiesLayer(() => runtime, Cause.squash, () => child))
  try {
    const events: ProcessEvent[] = []
    const service = runLegacySync(runtime, ProcessCapabilities, Cause.squash)
    const started = runLegacySync(runtime, service.start(spec, { abort: Effect.void, emit: event => Effect.sync(() => { events.push(event) }) }, Scope.makeUnsafe()), unwrap)
    assert.equal(started._tag, 'Acquired')
    if (started._tag !== 'Acquired') throw new Error('missing process')
    assert.equal(stdout.listenerCount('data'), 0)
    assert.equal(stdout.listenerCount('end'), 0)
    assert.deepEqual(runLegacySync(runtime, started.run.signallingState, unwrap), { _tag: 'Raw', killed: false })
    runLegacySync(runtime, started.run.process.signalChild('SIGTERM'), unwrap)
    assert.deepEqual(runLegacySync(runtime, started.run.signallingState, unwrap), { _tag: 'Raw', killed: true })
    assert.equal(child.exitCode, null)
    assert.deepEqual(calls, ['SIGTERM'])
    runLegacySync(runtime, started.run.process.writeStdin(new Uint8Array([1, 2])), unwrap)
    assert.deepEqual(stdin.read(), Buffer.from([1, 2]))
    stderr.emit('data', Buffer.from('fixture'))
    assert.equal(events[0]?._tag, 'stderr')
    let reaped = false
    const waiting = runLegacyPromise(runtime, started.run.awaitReaped, unwrap).then(value => { reaped = true; return value })
    child.emit('exit', 0, null)
    await Promise.resolve()
    assert.equal(reaped, false)
    child.emit('close', 0, null)
    assert.deepEqual(await waiting, { _tag: 'Raw', code: 0, signal: null, killed: true })
    assert.equal(events.at(-1)?._tag, 'complete')
    const sentinel = new Error('write sentinel')
    stdin.write = () => { throw sentinel }
    assert.throws(() => runLegacySync(runtime, started.run.process.writeStdin(new Uint8Array([3])), unwrap), error => error === sentinel)
  } finally { await runtime.dispose() }
})

test('raw worker termination ends stdin, sends child TERM and reaps after close', { timeout: 30000 }, async () => {
  const child = new ChildProcess()
  const stdin = new PassThrough()
  Object.defineProperties(child, { pid: { value: 43 }, stdin: { value: stdin } })
  const calls: string[] = []
  stdin.on('finish', () => calls.push('stdin-end'))
  child.kill = signal => { calls.push(String(signal)); return true }
  let runtime: ManagedRuntime.ManagedRuntime<ProcessCapabilities, never>
  runtime = ManagedRuntime.make(makeProcessCapabilitiesLayer(() => runtime, Cause.squash, () => child))
  try {
    const service = runLegacySync(runtime, ProcessCapabilities, Cause.squash)
    const started = runLegacySync(runtime, service.start({ ...spec, stdout: 'ignore', stdoutConsumption: 'deliver' }, { abort: Effect.void, emit: () => Effect.void }, Scope.makeUnsafe()), unwrap)
    if (started._tag !== 'Acquired') throw new Error('missing process')
    const stopped = runLegacyPromise(runtime, started.run.terminate(10000), unwrap)
    assert.deepEqual(calls, ['SIGTERM'])
    child.emit('close', null, 'SIGTERM')
    await stopped
    assert.equal(stdin.writableEnded, true)
    assert.deepEqual(calls.filter(call => call.startsWith('SIG')), ['SIGTERM'])
  } finally { await runtime.dispose() }
})

test('raw TERM-ignoring worker escalates child-only and still waits for close', { timeout: 30000 }, async () => {
  const child = new ChildProcess()
  Object.defineProperty(child, 'pid', { value: 44 })
  const calls: string[] = []
  let markKilled: (() => void) | undefined
  const killed = new Promise<void>(resolve => { markKilled = resolve })
  child.kill = signal => { calls.push(String(signal)); if (signal === 'SIGKILL') markKilled?.(); return true }
  let runtime: ManagedRuntime.ManagedRuntime<ProcessCapabilities, never>
  runtime = ManagedRuntime.make(makeProcessCapabilitiesLayer(() => runtime, Cause.squash, () => child))
  const keepAlive = setInterval(() => {}, 10000)
  try {
    const service = runLegacySync(runtime, ProcessCapabilities, Cause.squash)
    const started = runLegacySync(runtime, service.start({ ...spec, stdin: 'ignore', stdout: 'ignore', stdoutConsumption: 'deliver' }, { abort: Effect.void, emit: () => Effect.void }, Scope.makeUnsafe()), unwrap)
    if (started._tag !== 'Acquired') throw new Error('missing process')
    let completed = false
    const stopping = runLegacyPromise(runtime, started.run.terminate(0), unwrap).then(() => { completed = true })
    await killed
    assert.deepEqual(calls, ['SIGTERM', 'SIGKILL'])
    assert.equal(completed, false)
    child.emit('close', null, 'SIGKILL')
    await stopping
    assert.equal(completed, true)
  } finally { clearInterval(keepAlive); await runtime.dispose() }
})
