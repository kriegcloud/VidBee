import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { isSherpaProviderFallbackLog } from "./compute-provider.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionProcess } from "./TranscriptionProcess.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { WorkerProtocol } from "./WorkerProtocol.service.js";
import { RuntimeProbe } from "./WorkerRuntime.service.js";
import type { SherpaProviderProbeResult } from "./Host.model.js";
import type { BoundaryDecodeError, HostFailure } from "./Transcription.errors.js";
import type { WorkerProcessRun } from "./TranscriptionProcess.service.js";
import type { WorkerWireProbeOk } from "./Worker.model.js";
export const make = Effect.fnUntraced(function* () {
  const processes = yield* TranscriptionProcess;
  const time = yield* TranscriptionTime;
  const host = yield* TranscriptionHost;
  const protocol = yield* WorkerProtocol;
  const owner = yield* Effect.scope;
  return RuntimeProbe.of({
    run: Effect.fn("RuntimeProbe.run")(function* (input) {
      const childScope = yield* Scope.fork(owner);
      const result = yield* Deferred.make<SherpaProviderProbeResult, HostFailure | BoundaryDecodeError>();
      const runReady = yield* Deferred.make<WorkerProcessRun>();
      let settled = false;
      let stderr = "";
      let buffer = "";
      let probeOk: typeof WorkerWireProbeOk.Type | null = null;
      let cancelTimer: Effect.Effect<void> = Effect.void;
      let cancelFlush: Effect.Effect<void> = Effect.void;
      const stdoutDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
      const stderrDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
      const tail = (text: string) => {
        stderr = Str.slice(-12000)(`${stderr}${text}`);
      };
      const finish = (value: SherpaProviderProbeResult) =>
        Effect.suspend(() => {
          if (settled) return Effect.void;
          settled = true;
          return cancelFlush.pipe(
            Effect.andThen(
              Effect.forkIn(
                Effect.gen(function* () {
                  const run = yield* Deferred.await(runReady);
                  yield* run.terminate(1000).pipe(Effect.ignoreCause);
                  yield* Deferred.succeed(result, value);
                }),
                owner,
                { startImmediately: true }
              )
            ),
            Effect.asVoid
          );
        });
      const fail = (error: string) =>
        Effect.suspend(() =>
          finish({ durationMs: null, error, ok: false, provider: input.provider, stderr: Str.trim(stderr) })
        );
      const finishProbe = () =>
        Effect.suspend(() => {
          if (probeOk === null) return fail("provider probe exited without a result");
          const fallback = isSherpaProviderFallbackLog(input.provider, stderr);
          return finish({
            durationMs:
              typeof probeOk.durationMs === "number" && Number.isFinite(probeOk.durationMs) ? probeOk.durationMs : null,
            error: fallback ? `${input.provider} silently fell back to cpu` : null,
            ok: !fallback,
            provider: input.provider,
            stderr: Str.trim(stderr),
          });
        });
      const invalid = (error: BoundaryDecodeError) =>
        Effect.suspend(() => {
          if (settled) return Effect.void;
          settled = true;
          return cancelTimer.pipe(
            Effect.andThen(cancelFlush),
            Effect.andThen(
              Effect.forkIn(
                Effect.gen(function* () {
                  const run = yield* Deferred.await(runReady);
                  yield* run.terminate(1000).pipe(Effect.ignoreCause);
                  yield* Deferred.fail(result, error);
                }),
                owner,
                { startImmediately: true }
              )
            ),
            Effect.asVoid
          );
        });
      const consume = Effect.fnUntraced(function* (text: string) {
        buffer += text;
        let index = O.getOrUndefined(Str.indexOf("\n")(buffer));
        while (index !== undefined) {
          const line = Str.slice(0, index)(buffer);
          buffer = Str.slice(index + 1)(buffer);
          const message = yield* protocol.parse(line);
          if (message === null) {
            tail(`${line}\n`);
          } else if (message.type === "probe-ok") {
            probeOk = message;
            yield* cancelTimer;
            cancelFlush = yield* time.after(
              50,
              Effect.suspend(() => {
                cancelFlush = Effect.void;
                return finishProbe();
              }),
              { keepAlive: true }
            );
          } else if (message.type === "error") {
            yield* cancelTimer;
            yield* fail(message.message);
          }
          index = O.getOrUndefined(Str.indexOf("\n")(buffer));
        }
      });
      const snapshot = yield* host.snapshot;
      const started = yield* processes
        .start(
          {
            command: input.execPath,
            argv: [...(input.execArgv ?? []), input.workerScript],
            env: input.env,
            extendEnv: input.env === undefined,
            cwd: undefined,
            detached: snapshot.platform !== "win32",
            windowsHide: false,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            stdoutConsumption: "deliver",
            stderrConsumption: "deliver",
          },
          {
            abort: Effect.void,
            emit: Effect.fn("RuntimeProbe.emit")((event) => {
              if (event._tag === "stdout")
                return consume(stdoutDecoder.decode(event.chunk, { stream: true })).pipe(
                  Effect.catchTag("BoundaryDecodeError", invalid)
                );
              if (event._tag === "stderr")
                return Effect.sync(() => tail(stderrDecoder.decode(event.chunk, { stream: true })));
              if (event._tag === "stdoutEnd")
                return Effect.sync(() => {
                  buffer += stdoutDecoder.decode();
                });
              if (event._tag === "stderrEnd") return Effect.sync(() => tail(stderrDecoder.decode()));
              if (event._tag === "rawError")
                return cancelTimer.pipe(Effect.andThen(fail("provider probe process failed")));
              if (event._tag === "complete")
                return Effect.gen(function* () {
                  yield* cancelTimer;
                  const hasBuffer = Boolean(Str.trim(buffer));
                  if (hasBuffer) {
                    tail(buffer);
                    buffer = "";
                  }
                  yield* probeOk !== null ? finishProbe() : fail("provider probe process closed early");
                });
              return Effect.void;
            }),
          },
          childScope
        )
        .pipe(Effect.onError(() => Scope.close(childScope, Exit.void)));
      if (started._tag === "NativeSpawnFailure") {
        yield* Scope.close(childScope, Exit.void);
        return {
          durationMs: null,
          error: "provider probe process failed",
          ok: false,
          provider: input.provider,
          stderr: "",
        };
      }
      yield* Deferred.succeed(runReady, started.run);
      if (started.run.process.pid !== undefined) yield* host.lowerPriority(started.run.process.pid);
      if (!settled)
        cancelTimer = yield* time.after(input.timeoutMs ?? 120000, fail("provider probe timed out"), {
          keepAlive: true,
        });
      const encoded = yield* protocol.encode({
        type: "probe",
        modelsDir: input.modelsDir,
        provider: input.provider,
        asrTier: input.asrTier,
        benchmark: input.benchmark,
      });
      yield* started.run.writeStdin(new TextEncoder().encode(encoded));
      yield* started.run.endInput;
      return yield* Deferred.await(result).pipe(
        Effect.onExit(() =>
          cancelTimer.pipe(Effect.andThen(cancelFlush), Effect.andThen(Scope.close(childScope, Exit.void)))
        )
      );
    }),
  });
});
export const layer = Layer.effect(RuntimeProbe, make());
