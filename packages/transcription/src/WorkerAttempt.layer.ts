import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { AudioAbort } from "./Audio.service.js";
import { DetachedFailures } from "./DetachedFailures.service.js";
import { HostFailure, WorkerFailure } from "./Transcription.errors.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionProcess } from "./TranscriptionProcess.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { WorkerExitFailure } from "./WorkerAttempt.model.js";
import { WorkerAttempt } from "./WorkerAttempt.service.js";
import { WorkerProtocol } from "./WorkerProtocol.service.js";
import type { TranscriptionError } from "./Transcription.errors.js";
import type { WorkerProcessRun } from "./TranscriptionProcess.service.js";
import type { WorkerAttemptResult } from "./WorkerAttempt.model.js";
export const make = Effect.fnUntraced(function* () {
  const processes = yield* TranscriptionProcess;
  const time = yield* TranscriptionTime;
  const host = yield* TranscriptionHost;
  const protocol = yield* WorkerProtocol;
  const aborts = yield* AudioAbort;
  const owner = yield* Effect.scope;
  const failures = yield* DetachedFailures;
  return WorkerAttempt.of({
    run: Effect.fn("WorkerAttempt.run")(function* (input, sink) {
      const scope = yield* Scope.fork(owner);
      const ready = yield* Deferred.make<WorkerProcessRun>();
      const result = yield* Deferred.make<WorkerAttemptResult, TranscriptionError | WorkerExitFailure>();
      let settled = false;
      let terminationRequested = false;
      let buffer = "";
      let stopAlive: Effect.Effect<void> = Effect.void;
      let unsubscribe: Effect.Effect<void> = Effect.void;
      const stdout = new TextDecoder("utf-8", { ignoreBOM: true });
      const stderr = new TextDecoder("utf-8", { ignoreBOM: true });
      const failure = (message: string) => WorkerFailure.make({ operation: "worker", legacyMessage: message });
      const settle = (completion: Effect.Effect<WorkerAttemptResult, TranscriptionError | WorkerExitFailure>) =>
        Effect.suspend(() => {
          if (settled) return Effect.void;
          settled = true;
          return stopAlive.pipe(
            Effect.andThen(unsubscribe),
            Effect.andThen(
              Effect.forkIn(
                Effect.gen(function* () {
                  const run = yield* Deferred.await(ready);
                  const exit = yield* Effect.exit(run.terminate(1000).pipe(Effect.andThen(completion)));
                  yield* Deferred.done(result, exit);
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
          if (message !== null) {
            if (message.type === "progress") {
              if (message.stage === "committing") yield* stopAlive;
              const ticks = yield* time.now;
              yield* sink.progress(message.stage, message.percent, ticks);
            } else if (message.type === "partial")
              yield* sink.partial({
                speakerKey: message.speakerKey,
                startMs: message.startMs,
                endMs: message.endMs,
                text: message.text,
                words: message.words,
                confidence: null,
              });
            else if (message.type === "log") yield* sink.log(message.stream, message.line);
            else if (message.type === "result")
              yield* settle(
                Effect.gen(function* () {
                  const run = yield* Deferred.await(ready);
                  yield* run.endInput;
                  return {
                    result: yield* protocol.readResult(message, input.start.workDir),
                    durationMs: message.durationMs,
                  };
                })
              );
            else if (message.type === "error")
              yield* settle(
                Effect.gen(function* () {
                  const run = yield* Deferred.await(ready);
                  yield* run.endInput;
                  return yield* failure(
                    message.message === "cancelled" || input.signal.aborted ? "cancelled" : message.message
                  );
                })
              );
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
            stdoutConsumption: "events",
            stderrConsumption: "events",
          },
          {
            abort: Effect.void,
            emit: Effect.fn("WorkerAttempt.emit")((event) => {
              if (event._tag === "stdout")
                return consume(stdout.decode(event.chunk, { stream: true })).pipe(
                  Effect.catchTag("BoundaryDecodeError", (error) => settle(error)),
                  Effect.catchCause(failures.listener)
                );
              if (event._tag === "stderr") return sink.stderr(stderr.decode(event.chunk, { stream: true }));
              if (event._tag === "stdoutEnd")
                return Effect.sync(() => {
                  buffer += stdout.decode();
                });
              if (event._tag === "stderrEnd") return sink.stderr(stderr.decode());
              if (event._tag === "rawError")
                return settle(
                  HostFailure.make({
                    operation: "workerProcess",
                    legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
                    cause: event.error,
                  })
                );
              if (event._tag === "complete")
                return Deferred.await(ready).pipe(
                  Effect.flatMap((run) => sink.attach(null, run)),
                  Effect.andThen(
                    Effect.suspend(() => {
                      if (input.signal.aborted) return settle(failure("cancelled"));
                      const outcome = event.outcome;
                      if (outcome._tag === "Native" && outcome.result._tag === "Failure")
                        return settle(
                          HostFailure.make({
                            operation: "workerProcess",
                            legacyMessage: outcome.result.error.message,
                            cause: outcome.result.error,
                          })
                        );
                      const code =
                        outcome._tag === "Raw"
                          ? outcome.code
                          : outcome.result._tag === "ExitCode"
                            ? outcome.result.code
                            : null;
                      const signal = outcome._tag === "Raw" ? outcome.signal : null;
                      const summary = `ai-worker exited without result (code ${code}${signal === null ? "" : `, signal ${signal}`})`;
                      const tail = Str.slice(-800)(Str.trim(sink.stderrTail()));
                      return settle(
                        WorkerExitFailure.make({
                          code,
                          signal,
                          legacyMessage: tail.length > 0 ? `${summary}\n${tail}` : summary,
                        })
                      );
                    })
                  )
                );
              return Effect.void;
            }),
          },
          scope
        )
        .pipe(Effect.onError(() => Scope.close(scope, Exit.void)));
      if (started._tag === "NativeSpawnFailure") {
        yield* Scope.close(scope, Exit.void);
        return yield* HostFailure.make({
          operation: "workerSpawn",
          legacyMessage: started.error.message,
          cause: started.error,
        });
      }
      const run = started.run;
      yield* Deferred.succeed(ready, run);
      return yield* Effect.gen(function* () {
        yield* sink.attach(run);
        if (run.process.pid !== undefined) yield* host.lowerPriority(run.process.pid);
        const start = input.start;
        const ffmpegPath = sink.ffmpegPath === undefined ? start.ffmpegPath : yield* sink.ffmpegPath;
        const startText = yield* protocol.encode({ ...start, ffmpegPath });
        yield* run.writeInput(new TextEncoder().encode(startText));
        stopAlive = yield* time.every(
          10000,
          Effect.gen(function* () {
            const state = yield* run.signallingState;
            if ((state._tag === "Raw" && !state.killed) || (state._tag === "Native" && !terminationRequested))
              yield* sink.heartbeat;
          }),
          { keepAlive: false }
        );
        const onAbort = Effect.gen(function* () {
          terminationRequested = true;
          const cancelText = yield* protocol.encode({ type: "cancel" });
          yield* run.writeInput(new TextEncoder().encode(cancelText));
          yield* run.terminate(1000).pipe(Effect.catch((error) => settle(error)));
        });
        unsubscribe = yield* aborts.subscribe(input.signal, onAbort).pipe(Effect.provideService(Scope.Scope, scope));
        if (input.signal.aborted) yield* Effect.forkIn(onAbort, owner, { startImmediately: true });
        return yield* Deferred.await(result);
      }).pipe(
        Effect.onExit(() => stopAlive.pipe(Effect.andThen(unsubscribe), Effect.andThen(Scope.close(scope, Exit.void))))
      );
    }),
  });
});
export const layer = Layer.effect(WorkerAttempt, make());
