import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type * as Cause from 'effect/Cause'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import type * as Scope from 'effect/Scope'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { killProcessTree } from '@vidbee/task-queue-legacy/process'
import { DownloadProcess } from '../../downloader-core/src/DownloadProcess.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { ProcessCapabilities } from '../../downloader-core/src/ProcessCapabilities.service.js'
import type { ProcessSink } from '../../downloader-core/src/DownloadProcess.service.js'
import type { ProcessCapabilitiesSpec } from '../../downloader-core/src/ProcessCapabilities.model.js'
import type { ProcessCapabilitiesStart } from '../../downloader-core/src/ProcessCapabilities.service.js'
import type { ProcessEvent, ProcessOutcome } from '../../downloader-core/src/Process.model.js'

export type RawProcessSpawn = (command: string, argv: readonly string[], options: SpawnOptions) => ChildProcess

/** Direct listeners preserve synchronous delivery, original errors and the actual live killed flag. */
const services = <R, ER>(
  runtime: () => ManagedRuntime.ManagedRuntime<R, ER>,
  mapError: (cause: Cause.Cause<ER>) => unknown,
  spawnFn: RawProcessSpawn,
) => {
  const start = (spec: ProcessCapabilitiesSpec, sink: ProcessSink): Effect.Effect<ProcessCapabilitiesStart, HostFailure> => Effect.try({
    try: () => {
      if ((spec.stdoutConsumption === 'leaveUnread' && spec.stdout !== 'pipe') ||
          (spec.stderrConsumption === 'leaveUnread' && spec.stderr !== 'pipe')) {
        throw new Error('leaveUnread requires a piped output')
      }
      const child = spawnFn(spec.command, [...spec.argv], {
        ...(spec.env === undefined ? {} : { env: spec.extendEnv ? { ...process.env, ...spec.env } : spec.env }),
        ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
        detached: spec.detached,
        windowsHide: spec.windowsHide,
        stdio: [spec.stdin, spec.stdout, spec.stderr],
        ...(spec.abortSignal === undefined ? {} : { signal: spec.abortSignal }),
      })
      const reaped = Deferred.makeUnsafe<ProcessOutcome>()
      const emit = (event: ProcessEvent) => runLegacySync(runtime(), sink.emit(event), mapError)
      if (spec.stdoutConsumption === 'events') {
        child.stdout?.on('data', (chunk: Buffer) => emit({ _tag: 'stdout', chunk }))
        child.stdout?.on('end', () => emit({ _tag: 'stdoutEnd' }))
      }
      if (spec.stderrConsumption === 'events') {
        child.stderr?.on('data', (chunk: Buffer) => emit({ _tag: 'stderr', chunk }))
        child.stderr?.on('end', () => emit({ _tag: 'stderrEnd' }))
      }
      child.on('error', error => emit({ _tag: 'rawError', error }))
      child.on('exit', (code, signal) => emit({ _tag: 'rawExit', code, signal }))
      child.on('close', (code, signal) => {
        const outcome: ProcessOutcome = { _tag: 'Raw', code, signal, killed: child.killed }
        emit({ _tag: 'complete', outcome })
        runLegacySync(runtime(), Deferred.succeed(reaped, outcome), mapError)
      })
      const request = (operation: string, action: () => void) => Effect.try({
        try: action,
        catch: original => new HostFailure({ operation, legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
      })
      return {
        _tag: 'Acquired',
        run: {
          process: {
            pid: child.pid,
            signalChild: signal => request('signal', () => { child.kill(signal) }),
            signalPid: signal => Effect.sync(() => {
              if (!child.pid) return
              try { process.kill(child.pid, signal) } catch { /* Existing PID-only policy ignores errors. */ }
            }),
            signalGroup: signal => request('signal', () => { if (child.pid) process.kill(-child.pid, signal) }),
            signalTree: signal => request('signal', () => { if (child.pid) killProcessTree(child.pid, signal) }),
          },
          signallingState: Effect.sync(() => ({ _tag: 'Raw', killed: child.killed })),
          writeInput: bytes => request('writeInput', () => { child.stdin?.write(bytes) }),
          endInput: request('endInput', () => { child.stdin?.end() }),
          awaitReaped: Deferred.await(reaped),
          terminate: graceMs => Effect.tryPromise({
            try: () => new Promise<void>((resolve) => {
              if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) { resolve(); return }
              const timer = setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
              }, graceMs)
              timer.unref()
              child.once('close', () => { clearTimeout(timer); resolve() })
              child.stdin?.end()
              child.kill('SIGTERM')
            }),
            catch: original => new HostFailure({ operation: 'terminate', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
          }),
        },
      }
    },
    catch: original => new HostFailure({ operation: 'spawn', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
  })
  return {
    download: DownloadProcess.of({ start: (spec, sink) => start({ ...spec, stdoutConsumption: 'events', stderrConsumption: 'events' }, sink).pipe(
      Effect.map(result => result._tag === 'Acquired' ? { _tag: 'Acquired', run: result.run.process } : result),
    ) }),
    capabilities: ProcessCapabilities.of({ start: (spec, sink, _owner: Scope.Scope) => start(spec, sink) }),
  }
}
export const makeProcessLayer = <R, ER>(
  runtime: () => ManagedRuntime.ManagedRuntime<R, ER>,
  mapError: (cause: Cause.Cause<ER>) => unknown,
) => Layer.succeed(DownloadProcess, services(runtime, mapError, spawn).download)

export const makeProcessCapabilitiesLayer = <R, ER>(
  runtime: () => ManagedRuntime.ManagedRuntime<R, ER>,
  mapError: (cause: Cause.Cause<ER>) => unknown,
  spawnFn: RawProcessSpawn = spawn,
) => Layer.succeed(ProcessCapabilities, services(runtime, mapError, spawnFn).capabilities)
