import { spawn } from 'node:child_process';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { CliProbeProcess, CliLauncher, CliFailure } from '@vidbee/cli';
import { HostFailure } from '@vidbee/downloader-core/Downloader.errors';
export const CliLauncherHost = Layer.succeed(CliLauncher, {
  launch: (spec) => Effect.try({
    try: () => { const child = spawn(spec.command, [...spec.argv], { stdio: 'ignore', detached: true, windowsHide: true }); child.unref(); },
    catch: (cause) => CliFailure.make({ message: cause instanceof Error ? cause.message : String(cause), cause }),
  }),
});
export const CliProbeProcessHost = Layer.succeed(CliProbeProcess, {
  start: (spec, sink) => Effect.contextWith(context => Effect.try({
    try: () => {
      const child = spawn(spec.command, [...spec.argv], { stdio: ['ignore', 'pipe', 'pipe'] });
      // The sink performs only synchronous state reduction and Deferred completion.
      // Its effects carry no requirements; no runtime or queue owner is constructed.
      const emit = (event: Parameters<typeof sink.emit>[0]) => Effect.runSyncWith(context)(sink.emit(event));
      child.stdout.on('data', (chunk: Buffer) => emit({ _tag: 'stdout', chunk }));
      child.stderr.on('data', (chunk: Buffer) => emit({ _tag: 'stderr', chunk }));
      child.on('error', error => emit({ _tag: 'rawError', error }));
      child.on('close', (code, signal) => emit({ _tag: 'complete', outcome: { _tag: 'Raw', code, signal, killed: child.killed } }));
      const signal = (signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL') => Effect.sync(() => { try { child.kill(signal); } catch { /* Existing probe policy. */ } });
      return { _tag: 'Acquired' as const, run: {
        pid: child.pid, backend: 'Raw' as const,
        observeClose: Effect.void,
        signalChild: signal,
        signalGroup: () => HostFailure.make({ operation: 'signalGroup', legacyMessage: 'CLI probes expose direct-child signaling only' }),
        signalPid: requested => Effect.sync(() => { if (child.pid) { try { process.kill(child.pid, requested); } catch { /* Raw PID signaling is best effort. */ } } }),
        signalTree: () => HostFailure.make({ operation: 'signalTree', legacyMessage: 'CLI probes expose direct-child signaling only' }),
        writeStdin: () => HostFailure.make({ operation: 'stdin', legacyMessage: 'CLI probe stdin is ignored' }),
      }};
    },
    catch: cause => HostFailure.make({ operation: 'spawn', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }),
  })),
});
