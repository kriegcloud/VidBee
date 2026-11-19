import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import * as Effect from 'effect/Effect'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DownloadProcess } from '../../downloader-core/src/DownloadProcess.service.js'
import type { ProcessEvent, ProcessSpec } from '../../downloader-core/src/Process.model.js'
import { makeProcessLayer } from '../src/Process.layer.js'

const mocked = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocked.spawn, execFile: vi.fn() }))
const spec: ProcessSpec = {
  command: 'fixture', argv: [], env: undefined, extendEnv: false, cwd: undefined,
  detached: false, windowsHide: false, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
}
const child = () => Object.assign(new EventEmitter(), {
  pid: 42, killed: false, exitCode: null as number | null, signalCode: null as string | null, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
  kill: vi.fn(),
})
const setup = async (policies: Partial<ProcessSpec> = {}) => {
  const process = child()
  mocked.spawn.mockReturnValue(process)
  const events: ProcessEvent[] = []
  const runtime: ManagedRuntime.ManagedRuntime<DownloadProcess, never> = ManagedRuntime.make(
    makeProcessLayer(() => runtime, cause => cause)
  )
  const acquired = await runtime.runPromise(Effect.flatMap(DownloadProcess, service => service.start({ ...spec, ...policies }, {
    abort: Effect.void,
    emit: event => Effect.sync(() => { events.push(event) }),
  })))
  if (acquired._tag !== 'Acquired') throw acquired.error
  return { process, events, runtime, run: acquired.run }
}
afterEach(() => vi.clearAllMocks())
describe('compatibility process policies', () => {
  it('keeps defaults, raw chunks and persistent raw observers', async () => {
    const fixture = await setup()
    try {
      expect(fixture.process.listenerCount('error')).toBe(1)
      expect(fixture.process.listenerCount('exit')).toBe(1)
      expect(fixture.process.listenerCount('close')).toBe(1)
      expect(fixture.process.listenerCount('spawn')).toBe(0)
      fixture.process.stdout.write('out')
      fixture.process.stderr.write('err')
      fixture.process.emit('error', 'first')
      fixture.process.emit('error', 'second')
      fixture.process.emit('exit', 0, null)
      fixture.process.emit('close', 0, null)
      expect(fixture.events.map(event => event._tag)).toEqual(['stdout', 'stderr', 'rawError', 'rawError', 'rawExit', 'complete'])
    } finally { await fixture.runtime.dispose() }
  })
  it('omits observers and leaves unread pipes unconsumed', async () => {
    const fixture = await setup({ stdoutConsumption: 'unread', stderrConsumption: 'unread', rawErrorObservation: 'omit', rawExitObservation: 'omit', rawCloseObservation: 'omit' })
    try {
      for (const event of ['error', 'exit', 'close']) expect(fixture.process.listenerCount(event)).toBe(0)
      for (const stream of [fixture.process.stdout, fixture.process.stderr]) {
        expect(stream.listenerCount('data')).toBe(0)
        expect(stream.listenerCount('end')).toBe(0)
        expect(stream.readableFlowing).toBe(null)
      }
      expect(() => fixture.process.emit('error', new Error('unobserved'))).toThrow('unobserved')
      fixture.process.emit('close', 0, null)
      expect(fixture.events).toEqual([])
    } finally { await fixture.runtime.dispose() }
  })
  it('registers close only on demand, does not replay and never ends stdin', async () => {
    const fixture = await setup({ rawCloseObservation: 'on-demand', rawErrorObservation: 'once', rawSpawnObservation: 'once' })
    try {
      expect(fixture.process.listenerCount('close')).toBe(0)
      fixture.process.emit('close', 0, null)
      await fixture.runtime.runPromise(fixture.run.observeClose)
      expect(fixture.events).toEqual([])
      expect(fixture.process.listenerCount('close')).toBe(1)
      fixture.process.emit('spawn')
      fixture.process.emit('error', 'once')
      expect(fixture.process.listenerCount('spawn')).toBe(0)
      expect(fixture.process.listenerCount('error')).toBe(0)
      await fixture.runtime.runPromise(fixture.run.writeStdin(new Uint8Array([113])))
      expect(fixture.process.stdin.writableEnded).toBe(false)
      expect(fixture.process.stdin.read()).toEqual(Buffer.from('q'))
      fixture.process.emit('close', 0, null)
      expect(fixture.process.listenerCount('close')).toBe(0)
      expect(fixture.events.map(event => event._tag)).toEqual(['rawSpawn', 'rawError', 'complete'])
    } finally { await fixture.runtime.dispose() }
  })
  it('one-shot close removes itself and a missing stdin remains a no-op', async () => {
    const fixture = await setup({ rawCloseObservation: 'once' })
    try {
      Object.defineProperty(fixture.process, 'stdin', { value: null })
      await fixture.runtime.runPromise(fixture.run.writeStdin(new Uint8Array([113])))
      fixture.process.emit('close', 0, null)
      fixture.process.emit('close', 0, null)
      expect(fixture.process.listenerCount('close')).toBe(0)
      expect(fixture.events.map(event => event._tag)).toEqual(['complete'])
    } finally { await fixture.runtime.dispose() }
  })

  it('activates requested observations exactly once after the caller start window', async () => {
    const fixture = await setup({ rawObservationStart: 'on-demand', rawErrorObservation: 'once', rawCloseObservation: 'once' })
    try {
      expect(fixture.process.listenerCount('error')).toBe(0)
      expect(fixture.process.stdout.listenerCount('data')).toBe(0)
      expect(fixture.run.backend).toBe('Raw')
      expect(await fixture.runtime.runPromise(fixture.run.isRunning ?? Effect.succeed(false))).toBe(true)
      await fixture.runtime.runPromise(fixture.run.activateObservations ?? Effect.void)
      await fixture.runtime.runPromise(fixture.run.activateObservations ?? Effect.void)
      expect(fixture.process.listenerCount('error')).toBe(1)
      expect(fixture.process.stdout.listenerCount('data')).toBe(1)
      fixture.process.exitCode = 0
      expect(await fixture.runtime.runPromise(fixture.run.isRunning ?? Effect.succeed(true))).toBe(false)
      fixture.process.emit('close', 0, null)
      expect(fixture.events.map(event => event._tag)).toEqual(['complete'])
    } finally { await fixture.runtime.dispose() }
  })

})
