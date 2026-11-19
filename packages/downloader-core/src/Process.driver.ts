import { ProcessRequests } from "@vidbee/task-queue/ProcessControl.service";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { DownloadProcess } from "./DownloadProcess.service.js";
import type { ProcessOutputChannel, ProcessOutputEnd, TerminationSignal } from "./DownloadLiterals.model.js";
import type { ProcessStart } from "./DownloadProcess.service.js";
import type { NativeOutcome, ProcessEvent } from "./Process.model.js";

/** Stock-spawner backend. Its exit observations deliberately carry no Node killed/signal fields. */
export const layer = Layer.effect(
  DownloadProcess,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const requests = yield* ProcessRequests;
    const scope = yield* Effect.scope;
    return DownloadProcess.of({
      start: Effect.fn("DownloadProcess.start")(function* (spec, sink) {
        const attemptScope = yield* Scope.fork(scope);
        const abort = spec.abortSignal;
        const abortFiber =
          abort === undefined
            ? undefined
            : yield* Effect.forkIn(
                Effect.callback<void>((resume) => {
                  const onAbort = () => resume(sink.abort);
                  abort.addEventListener("abort", onAbort, { once: true });
                  if (abort.aborted) onAbort();
                  return Effect.sync(() => abort.removeEventListener("abort", onAbort));
                }),
                scope,
                { startImmediately: true }
              );
        const acquired = yield* Effect.result(
          spawner
            .spawn(
              ChildProcess.make(spec.command, spec.argv, {
                env: spec.env,
                extendEnv: spec.extendEnv,
                cwd: spec.cwd,
                detached: spec.detached,
                windowsHide: spec.windowsHide,
                stdin: spec.stdin,
                stdout: spec.stdout,
                stderr: spec.stderr,
              })
            )
            .pipe(Effect.provideService(Scope.Scope, attemptScope))
        );
        if (Result.isFailure(acquired)) {
          if (abortFiber !== undefined) yield* Fiber.interrupt(abortFiber);
          yield* Scope.close(attemptScope, Exit.void);
          const failed: ProcessStart = { _tag: "NativeSpawnFailure", error: acquired.failure };
          return failed;
        }
        const handle = acquired.success;
        const run = {
          pid: handle.pid,
          signalChild: (signal: typeof TerminationSignal.Type) => requests.pid(handle.pid, signal),
          signalPid: (signal: typeof TerminationSignal.Type) => requests.pid(handle.pid, signal),
          signalGroup: (signal: typeof TerminationSignal.Type) => requests.group(handle.pid, signal),
          signalTree: (signal: typeof TerminationSignal.Type) => requests.tree(handle.pid, signal),
        };
        const observe = Effect.fnUntraced(function* () {
          const drain = (
            stream: typeof handle.stdout,
            tag: typeof ProcessOutputChannel.Type,
            end: typeof ProcessOutputEnd.Type
          ) =>
            Stream.runForEach(stream, (chunk) => sink.emit({ _tag: tag, chunk })).pipe(
              Effect.andThen(sink.emit({ _tag: end }))
            );
          let outcome: NativeOutcome = { _tag: "ExitCode", code: 0 };
          const exit = handle.exitCode.pipe(
            Effect.tap((code) => {
              outcome = { _tag: "ExitCode", code };
              return sink.emit({ _tag: "nativeExit", result: outcome });
            }),
            Effect.tapError((error) => sink.emit({ _tag: "nativeExit", result: { _tag: "Failure", error } }))
          );
          const observed = yield* Effect.result(
            Effect.all(
              [drain(handle.stdout, "stdout", "stdoutEnd"), drain(handle.stderr, "stderr", "stderrEnd"), exit],
              { concurrency: "unbounded" }
            )
          );
          if (Result.isFailure(observed)) outcome = { _tag: "Failure", error: observed.failure };
          const completed: ProcessEvent = {
            _tag: "complete",
            outcome: { _tag: "Native", result: outcome },
          };
          yield* sink.emit(completed);
        });
        const observed =
          abortFiber === undefined ? observe() : observe().pipe(Effect.ensuring(Fiber.interrupt(abortFiber)));
        yield* Effect.forkIn(observed.pipe(Effect.ensuring(Scope.close(attemptScope, Exit.void))), scope, {
          startImmediately: true,
        });
        const started: ProcessStart = { _tag: "Acquired", run };
        return started;
      }),
    });
  })
);
