import { ProcessRequests } from "@vidbee/task-queue/ProcessControl.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { HostFailure } from "./Downloader.errors.js";
import { DownloadProcess } from "./DownloadProcess.service.js";
import type * as Cause from "effect/Cause";
import type { ProcessOutputChannel, ProcessOutputEnd } from "./DownloadLiterals.model.js";
import type { ProcessLifecycle, ProcessStart } from "./DownloadProcess.service.js";
import type { NativeOutcome, ProcessEvent, ProcessOutcome, ProcessSignal } from "./Process.model.js";

/**
 * Stock-spawner backend. Acquisition/error listeners and PassThrough buffering belong to
 * the spawner, so raw observer omission and original unread-pipe backpressure are not parity.
 * Native exit/complete carry no Node killed/signal fields, and rawSpawn is never fabricated.
 */
export const layer = Layer.effect(
  DownloadProcess,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const requests = yield* ProcessRequests;
    const scope = yield* Effect.scope;
    return DownloadProcess.of({
      start: Effect.fn("DownloadProcess.start")(function* (spec, sink, suppliedOwner) {
        const owner = spec.extendedLifecycle === true ? (suppliedOwner ?? scope) : scope;
        const attemptScope = yield* Scope.fork(owner);
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
                owner,
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
                stdin: { stream: spec.stdin, endOnDone: spec.extendedLifecycle === true },
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
        // A single open feeder owns the Sink. Unbounded queue admission acknowledges
        // without waiting for writable drain; cancellation belongs to the attempt.
        const input = yield* Queue.make<Uint8Array, Cause.Done>();
        yield* Scope.addFinalizer(attemptScope, Queue.shutdown(input));
        if (spec.stdin === "pipe") {
          yield* Effect.forkIn(Stream.fromQueue(input).pipe(Stream.run(handle.stdin), Effect.ignore), attemptScope, {
            startImmediately: true,
          });
        }
        const reaped = yield* Deferred.make<ProcessOutcome>();
        let closeObserved = spec.rawCloseObservation !== "omit" && spec.rawCloseObservation !== "on-demand";
        let closed = false;
        const lifecycle: ProcessLifecycle | undefined =
          spec.extendedLifecycle === true
            ? {
                endInput: Queue.end(input).pipe(Effect.asVoid),
                awaitReaped: Deferred.await(reaped),
                signallingState: Effect.succeed({ _tag: "Native" }),
                terminate: Effect.fn("DownloadProcess.terminate")(function* (graceMs: number) {
                  if (yield* Deferred.isDone(reaped)) return;
                  yield* Queue.end(input);
                  yield* requests.pid(handle.pid, "SIGTERM");
                  yield* Deferred.await(reaped).pipe(
                    Effect.timeoutOrElse({
                      duration: graceMs,
                      orElse: () => requests.pid(handle.pid, "SIGKILL").pipe(Effect.andThen(Deferred.await(reaped))),
                    })
                  );
                }),
              }
            : undefined;
        const run = {
          ...(lifecycle === undefined ? {} : { lifecycle }),
          backend: "Native" as const,
          pid: handle.pid,
          activateObservations: Effect.void,
          isRunning: handle.isRunning.pipe(
            Effect.mapError((cause) =>
              HostFailure.make({ operation: "isRunning", legacyMessage: cause.message, cause })
            )
          ),
          writeStdin: (bytes: Uint8Array) =>
            spec.stdin !== "pipe"
              ? Effect.void
              : Queue.offer(input, bytes).pipe(
                  Effect.flatMap((accepted) =>
                    accepted
                      ? Effect.void
                      : Effect.fail(HostFailure.make({ operation: "stdin", legacyMessage: "Process input is closed" }))
                  )
                ),
          observeClose: Effect.sync(() => {
            if (!closed) closeObserved = true;
          }),
          signalChild: (signal: ProcessSignal) => requests.pid(handle.pid, signal),
          signalPid: (signal: ProcessSignal) => requests.pid(handle.pid, signal),
          signalGroup: (signal: ProcessSignal) => requests.group(handle.pid, signal),
          signalTree: (signal: ProcessSignal) => requests.tree(handle.pid, signal),
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
              [
                spec.stdoutConsumption === "unread" || (spec.extendedLifecycle === true && spec.stdout !== "pipe")
                  ? Effect.void
                  : drain(handle.stdout, "stdout", "stdoutEnd"),
                spec.stderrConsumption === "unread" || (spec.extendedLifecycle === true && spec.stderr !== "pipe")
                  ? Effect.void
                  : drain(handle.stderr, "stderr", "stderrEnd"),
                exit,
              ],
              { concurrency: "unbounded" }
            )
          );
          if (Result.isFailure(observed)) outcome = { _tag: "Failure", error: observed.failure };
          const completed: ProcessEvent = {
            _tag: "complete",
            outcome: { _tag: "Native", result: outcome },
          };
          closed = true;
          if (closeObserved) yield* sink.emit(completed);
        });
        const observed =
          abortFiber === undefined ? observe() : observe().pipe(Effect.ensuring(Fiber.interrupt(abortFiber)));
        const finalize = Scope.close(attemptScope, Exit.void).pipe(
          Effect.andThen(
            spec.extendedLifecycle === true
              ? Effect.result(handle.exitCode).pipe(
                  Effect.flatMap((exit) =>
                    Deferred.succeed(reaped, {
                      _tag: "Native",
                      result: Result.isSuccess(exit)
                        ? { _tag: "ExitCode", code: exit.success }
                        : { _tag: "Failure", error: exit.failure },
                    })
                  ),
                  Effect.asVoid
                )
              : Effect.void
          )
        );
        yield* Effect.forkIn(observed.pipe(Effect.ensuring(finalize)), owner, {
          startImmediately: true,
        });
        const started: ProcessStart = { _tag: "Acquired", run };
        return started;
      }),
    });
  })
);
