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
import { ProcessCapabilities } from "./ProcessCapabilities.service.js";
import type * as Cause from "effect/Cause";
import type { ProcessOutputChannel, ProcessOutputEnd, TerminationSignal } from "./DownloadLiterals.model.js";
import type { ProcessSink, ProcessStart } from "./DownloadProcess.service.js";
import type { NativeOutcome, ProcessOutcome } from "./Process.model.js";
import type { ProcessCapabilitiesSpec } from "./ProcessCapabilities.model.js";
import type { ProcessCapabilitiesRun, ProcessCapabilitiesStart } from "./ProcessCapabilities.service.js";

/** Shared acquisition and observation implementation for settled and additive callers. */
export const makeNativeServices = Effect.fn("ProcessCapabilities.makeNativeServices")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const requests = yield* ProcessRequests;
  const layerScope = yield* Effect.scope;
  const startOwned = Effect.fn("ProcessCapabilities.startOwned")(function* (
    spec: ProcessCapabilitiesSpec,
    sink: ProcessSink,
    owner: Scope.Scope,
    extended: boolean
  ) {
    if (
      (spec.stdoutConsumption === "leaveUnread" && spec.stdout !== "pipe") ||
      (spec.stderrConsumption === "leaveUnread" && spec.stderr !== "pipe")
    ) {
      return yield* HostFailure.make({ operation: "start", legacyMessage: "leaveUnread requires a piped output" });
    }
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
      const failure: ProcessCapabilitiesStart = { _tag: "NativeSpawnFailure", error: acquired.failure };
      return failure;
    }
    const handle = acquired.success;
    const reaped = yield* Deferred.make<ProcessOutcome>();
    const input = yield* Queue.unbounded<Uint8Array, Cause.Done>();
    const feeder =
      extended && spec.stdin === "pipe"
        ? yield* Effect.forkIn(Stream.run(Stream.fromQueue(input), handle.stdin), attemptScope, {
            startImmediately: true,
          })
        : undefined;
    const process = {
      pid: handle.pid,
      signalChild: (signal: typeof TerminationSignal.Type) => requests.pid(handle.pid, signal),
      signalPid: (signal: typeof TerminationSignal.Type) => requests.pid(handle.pid, signal),
      signalGroup: (signal: typeof TerminationSignal.Type) => requests.group(handle.pid, signal),
      signalTree: (signal: typeof TerminationSignal.Type) => requests.tree(handle.pid, signal),
    };
    const endInput = feeder === undefined ? Effect.void : Queue.end(input).pipe(Effect.asVoid);
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
            spec.stdoutConsumption === "leaveUnread" || (extended && spec.stdout !== "pipe")
              ? Effect.void
              : drain(handle.stdout, "stdout", "stdoutEnd"),
            spec.stderrConsumption === "leaveUnread" || (extended && spec.stderr !== "pipe")
              ? Effect.void
              : drain(handle.stderr, "stderr", "stderrEnd"),
            exit,
          ],
          { concurrency: "unbounded" }
        )
      );
      if (Result.isFailure(observed)) outcome = { _tag: "Failure", error: observed.failure };
      const completed: ProcessOutcome = { _tag: "Native", result: outcome };
      yield* sink.emit({ _tag: "complete", outcome: completed });
      // A failed output stream does not establish exit. Stock finalization owns termination/reaping.
      if (!extended) {
        yield* Scope.close(attemptScope, Exit.void);
        yield* Deferred.succeed(reaped, completed);
      }
    });
    const observed =
      abortFiber === undefined ? observe() : observe().pipe(Effect.ensuring(Fiber.interrupt(abortFiber)));
    const finalize = extended
      ? Scope.close(attemptScope, Exit.void).pipe(
          Effect.andThen(Effect.result(handle.exitCode)),
          Effect.flatMap((exit) =>
            Deferred.succeed(reaped, {
              _tag: "Native",
              result: Result.isSuccess(exit)
                ? { _tag: "ExitCode", code: exit.success }
                : { _tag: "Failure", error: exit.failure },
            }).pipe(Effect.asVoid)
          )
        )
      : Scope.close(attemptScope, Exit.void);
    yield* Effect.forkIn(observed.pipe(Effect.ensuring(finalize)), owner, {
      startImmediately: true,
    });
    const run: ProcessCapabilitiesRun = {
      process,
      signallingState: Effect.succeed({ _tag: "Native" }),
      writeInput:
        feeder === undefined
          ? () => Effect.void
          : Effect.fn("ProcessCapabilities.writeInput")(function* (bytes: Uint8Array) {
              const accepted = yield* Queue.offer(input, bytes);
              if (!accepted)
                return yield* HostFailure.make({ operation: "writeInput", legacyMessage: "process input is closed" });
            }),
      endInput,
      awaitReaped: Deferred.await(reaped),
      terminate: Effect.fn("ProcessCapabilities.terminate")(function* (graceMs: number) {
        if (yield* Deferred.isDone(reaped)) return;
        // End the one feeder without blocking TERM on a backpressured writable.
        yield* Queue.end(input);
        yield* process.signalChild("SIGTERM");
        yield* Deferred.await(reaped).pipe(
          Effect.timeoutOrElse({
            duration: graceMs,
            orElse: () => process.signalChild("SIGKILL").pipe(Effect.andThen(Deferred.await(reaped))),
          })
        );
      }),
    };
    const started: ProcessCapabilitiesStart = { _tag: "Acquired", run };
    return started;
  });
  return {
    capabilities: ProcessCapabilities.of({
      start: Effect.fn("ProcessCapabilities.start")((spec, sink, owner) => startOwned(spec, sink, owner, true)),
    }),
    download: DownloadProcess.of({
      start: Effect.fn("DownloadProcess.start")(function* (spec, sink) {
        const started = yield* startOwned(
          { ...spec, stdoutConsumption: "events", stderrConsumption: "events" },
          sink,
          layerScope,
          false
        );
        const result: ProcessStart =
          started._tag === "Acquired" ? { _tag: "Acquired", run: started.run.process } : started;
        return result;
      }),
    }),
  };
});
export const layer = Layer.effect(
  ProcessCapabilities,
  makeNativeServices().pipe(Effect.map((services) => services.capabilities))
);
