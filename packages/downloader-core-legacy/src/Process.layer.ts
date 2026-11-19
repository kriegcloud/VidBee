import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { killProcessTree } from '@vidbee/task-queue-legacy/process'
import { DownloadProcess } from '../../downloader-core/src/DownloadProcess.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { ProcessEvent, ProcessSignal, ProcessSpec } from '../../downloader-core/src/Process.model.js'

export interface RawProcessInvocation {
  readonly options?: (spec: ProcessSpec, options: SpawnOptions) => SpawnOptions
  readonly stdin?: (spec: ProcessSpec, bytes: Uint8Array) => string | Uint8Array
}

/** Direct listeners preserve synchronous callback delivery and original host error identity. */
export const makeProcessLayer = <R, ER>(
  runtime: () => ManagedRuntime.ManagedRuntime<R, ER>,
  mapError: (cause: Cause.Cause<ER>) => unknown,
  invocation?: RawProcessInvocation,
) => Layer.succeed(DownloadProcess, DownloadProcess.of({
  start: (spec, sink) => Effect.try({
    try: () => {
      const options: SpawnOptions = {
        ...(spec.env === undefined ? {} : { env: spec.extendEnv ? { ...process.env, ...spec.env } : spec.env }),
        ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
        detached: spec.detached,
        windowsHide: spec.windowsHide,
        stdio: [spec.stdin, spec.stdout, spec.stderr],
        ...(spec.abortSignal === undefined ? {} : { signal: spec.abortSignal }),
      }
      const child = spawn(spec.command, [...spec.argv], invocation?.options?.(spec, options) ?? options)
      const emit = (event: ProcessEvent) => runLegacySync(runtime(), sink.emit(event), mapError)
      const close = (code: number | null, signal: NodeJS.Signals | null) => emit({ _tag: 'complete', outcome: { _tag: 'Raw', code, signal, killed: child.killed } })
      let active = false
      const activate = () => {
        if (active) return
        active = true
      if (spec.stdoutConsumption !== 'unread') {
        child.stdout?.on('data', (chunk: Buffer) => emit({ _tag: 'stdout', chunk }))
        child.stdout?.on('end', () => emit({ _tag: 'stdoutEnd' }))
      }
      if (spec.stderrConsumption !== 'unread') {
        child.stderr?.on('data', (chunk: Buffer) => emit({ _tag: 'stderr', chunk }))
        child.stderr?.on('end', () => emit({ _tag: 'stderrEnd' }))
      }
      if (spec.rawErrorObservation !== 'omit') {
        const observe = spec.rawErrorObservation === 'once' ? child.once.bind(child) : child.on.bind(child)
        observe('error', error => emit({ _tag: 'rawError', error }))
      }
      if (spec.rawSpawnObservation === 'once') child.once('spawn', () => emit({ _tag: 'rawSpawn' }))
      if (spec.rawExitObservation !== 'omit') child.on('exit', (code, signal) => emit({ _tag: 'rawExit', code, signal }))
      if (spec.rawCloseObservation === 'once') child.once('close', close)
      else if (spec.rawCloseObservation !== 'on-demand' && spec.rawCloseObservation !== 'omit') child.on('close', close)
      }
      if (spec.rawObservationStart !== 'on-demand') activate()
      const request = (action: () => void) => Effect.try({
        try: action,
        catch: original => new HostFailure({ operation: 'signal', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
      })
      return {
        _tag: 'Acquired' as const,
        run: {
          pid: child.pid,
          backend:"Raw" as const,
          activateObservations: Effect.sync(activate),
          isRunning: Effect.sync(() => child.exitCode === null && child.signalCode === null),
          writeStdin: (bytes: Uint8Array) => Effect.try({
            try: () => { child.stdin?.write(invocation?.stdin?.(spec, bytes) ?? bytes) },
            catch: original => new HostFailure({ operation: 'stdin', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
          }),
          observeClose: Effect.sync(() => { child.once('close', close) }),
          signalChild: (signal: ProcessSignal) => request(() => { child.kill(signal) }),
          signalPid: (signal: ProcessSignal) => Effect.sync(() => {
            if (!child.pid) return
            try { process.kill(child.pid, signal) } catch { /* Existing PID-only policy ignores errors. */ }
          }),
          signalGroup: (signal: ProcessSignal) => request(() => { if (child.pid) process.kill(-child.pid, signal) }),
          signalTree: (signal: ProcessSignal) => request(() => {
            const pid = child.pid
            if (!pid) return
            if (signal !== 'SIGINT') return killProcessTree(pid, signal)
            try { process.kill(-pid, signal) } catch { try { process.kill(pid, signal) } catch { /* Already gone. */ } }
          }),
        },
      }
    },
    catch: original => new HostFailure({ operation: 'spawn', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
  }),
}))
