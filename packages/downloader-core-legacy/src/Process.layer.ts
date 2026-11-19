import { spawn } from 'node:child_process'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { killProcessTree } from '@vidbee/task-queue-legacy/process'
import { DownloadProcess } from '../../downloader-core/src/DownloadProcess.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { ProcessEvent } from '../../downloader-core/src/Process.model.js'

/** Direct listeners preserve synchronous callback delivery and original host error identity. */
export const makeProcessLayer = <R, ER>(
  runtime: () => ManagedRuntime.ManagedRuntime<R, ER>,
  mapError: (cause: Cause.Cause<ER>) => unknown,
) => Layer.succeed(DownloadProcess, DownloadProcess.of({
  start: (spec, sink) => Effect.try({
    try: () => {
      const child = spawn(spec.command, [...spec.argv], {
        ...(spec.env === undefined ? {} : { env: spec.extendEnv ? { ...process.env, ...spec.env } : spec.env }),
        ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
        detached: spec.detached,
        windowsHide: spec.windowsHide,
        stdio: [spec.stdin, spec.stdout, spec.stderr],
        ...(spec.abortSignal === undefined ? {} : { signal: spec.abortSignal }),
      })
      const emit = (event: ProcessEvent) => runLegacySync(runtime(), sink.emit(event), mapError)
      child.stdout?.on('data', (chunk: Buffer) => emit({ _tag: 'stdout', chunk }))
      child.stderr?.on('data', (chunk: Buffer) => emit({ _tag: 'stderr', chunk }))
      child.stdout?.on('end', () => emit({ _tag: 'stdoutEnd' }))
      child.stderr?.on('end', () => emit({ _tag: 'stderrEnd' }))
      child.on('error', error => emit({ _tag: 'rawError', error }))
      child.on('exit', (code, signal) => emit({ _tag: 'rawExit', code, signal }))
      child.on('close', (code, signal) => emit({ _tag: 'complete', outcome: { _tag: 'Raw', code, signal, killed: child.killed } }))
      const request = (action: () => void) => Effect.try({
        try: action,
        catch: original => new HostFailure({ operation: 'signal', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
      })
      return {
        _tag: 'Acquired' as const,
        run: {
          pid: child.pid,
          signalChild: (signal: 'SIGTERM' | 'SIGKILL') => request(() => { child.kill(signal) }),
          signalPid: (signal: 'SIGTERM' | 'SIGKILL') => Effect.sync(() => {
            if (!child.pid) return
            try { process.kill(child.pid, signal) } catch { /* Existing PID-only policy ignores errors. */ }
          }),
          signalGroup: (signal: 'SIGTERM' | 'SIGKILL') => request(() => { if (child.pid) process.kill(-child.pid, signal) }),
          signalTree: (signal: 'SIGTERM' | 'SIGKILL') => request(() => { if (child.pid) killProcessTree(child.pid, signal) }),
        },
      }
    },
    catch: original => new HostFailure({ operation: 'spawn', legacyMessage: original instanceof Error ? original.message : String(original), cause: original }),
  }),
}))
