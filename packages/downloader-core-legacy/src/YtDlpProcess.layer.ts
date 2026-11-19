import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Cause from 'effect/Cause'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { killProcessTree } from '@vidbee/task-queue-legacy/process'
import { YtDlpProcess } from '../../downloader-core/src/YtDlpProcess.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { ProcessSignal } from '../../downloader-core/src/Process.model.js'
import type { WrapperObservation } from '../../downloader-core/src/YtDlpWrapper.model.js'
import type { YtDlpExecutorOptions } from './yt-dlp-executor.js'

/** Injected emitters are already wrapper observations; never run the raw conversion again. */
export const makeInjectedYtDlpProcessLayer = <R, ER>(
  runtime: () => ManagedRuntime.ManagedRuntime<R, ER>,
  mapError: (cause: Cause.Cause<ER>) => unknown,
  spawnFn: NonNullable<YtDlpExecutorOptions['spawnFn']>,
) => Layer.succeed(YtDlpProcess, {
  start: (spec, sink) => Effect.try({
    try: () => {
      const emitter = spawnFn(spec.command, [...spec.argv], spec.abortSignal ?? new AbortController().signal)
      const emit = (event: WrapperObservation) => runLegacySync(runtime(), sink.emit(event), mapError)
      emitter.on('progress', payload => emit({ _tag: 'progress', payload }))
      emitter.on('close', code => emit({ _tag: 'close', code }))
      emitter.on('error', error => emit({ _tag: 'error', error }))
      emitter.ytDlpProcess?.stdout?.on('data', (chunk: Buffer) => emit({ _tag: 'stdout', chunk }))
      emitter.ytDlpProcess?.stderr?.on('data', (chunk: Buffer) => emit({ _tag: 'stderr', chunk }))
      const child = emitter.ytDlpProcess
      const request = (action: () => void) => Effect.try({ try: action, catch: cause => new HostFailure({ operation: 'signal', cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) }) })
      return { _tag: 'Acquired' as const, run: {
        pid: child?.pid,
        writeStdin: (_bytes: Uint8Array) => Effect.void,
        observeClose: Effect.sync(() => { emitter.once('close', code => emit({ _tag: 'close', code })) }),
        signalChild: (signal: ProcessSignal) => request(() => { child?.kill(signal) }),
        signalPid: (signal: ProcessSignal) => Effect.sync(() => { if (child?.pid) { try { process.kill(child.pid, signal) } catch {} } }),
        signalGroup: (signal: ProcessSignal) => request(() => { if (child?.pid) process.kill(-child.pid, signal) }),
        signalTree: (signal: ProcessSignal) => request(() => {
          const pid = child?.pid
          if (!pid) return
          if (signal !== 'SIGINT') return killProcessTree(pid, signal)
          try { process.kill(-pid, signal) } catch { try { process.kill(pid, signal) } catch {} }
        }),
      } }
    },
    catch: cause => new HostFailure({ operation: 'spawn', cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) }),
  }),
})
