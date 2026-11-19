import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { CaptionProcessOwner } from "./CaptionProcessOwner.service.js";
import { HostFailure, SourceUnavailable } from "./Transcription.errors.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionProcess } from "./TranscriptionProcess.service.js";
import type { ProcessOutcome } from "@vidbee/downloader-core/Process.model";
import type { TranscriptionError } from "./Transcription.errors.js";

/** The owner survives caller timeout and retains each process through actual reaping. */
export const makeLayer = (lowerPriority: (pid: number) => Effect.Effect<void, HostFailure>) =>
  Layer.effect(
    CaptionProcessOwner,
    Effect.gen(function* () {
      const process = yield* TranscriptionProcess;
      const rootScope = yield* Effect.scope;
      const owner = yield* Scope.fork(rootScope);
      let accepting = true;
      yield* Scope.addFinalizer(
        rootScope,
        Effect.sync(() => {
          accepting = false;
        })
      );
      return CaptionProcessOwner.of({
        capture: Effect.fn("CaptionProcessOwner.capture")(function* (spec, timeoutMs) {
          if (!accepting)
            return yield* SourceUnavailable.make({
              operation: "capture",
              legacyMessage: "caption process owner is closed",
            });
          const childScope = yield* Scope.fork(owner);
          const result = yield* Deferred.make<string, TranscriptionError>();
          let stdout = "";
          let stderr = "";
          let settled = false;
          const fail = (error: TranscriptionError) =>
            Effect.suspend(() => {
              if (settled) return Effect.void;
              settled = true;
              return Deferred.fail(result, error).pipe(Effect.asVoid);
            });
          const complete = (outcome: ProcessOutcome) =>
            Effect.suspend(() => {
              if (settled) return Effect.void;
              const code =
                outcome._tag === "Raw" ? outcome.code : outcome.result._tag === "ExitCode" ? outcome.result.code : null;
              if (outcome._tag === "Native" && outcome.result._tag === "Failure") {
                return fail(
                  HostFailure.make({
                    operation: "capture",
                    legacyMessage: outcome.result.error.message,
                    cause: outcome.result.error,
                  })
                );
              }
              if (code !== 0)
                return fail(
                  SourceUnavailable.make({
                    operation: "capture",
                    legacyMessage: `${spec.command} failed (exit ${code}): ${Str.slice(-500)(stderr)}`,
                  })
                );
              settled = true;
              return Deferred.succeed(result, stdout).pipe(Effect.asVoid);
            });
          const started = yield* process
            .start(
              spec,
              {
                abort: Effect.void,
                emit: Effect.fn("CaptionProcessOwner.emit")((event) => {
                  if (event._tag === "stdout") {
                    stdout += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
                  } else if (event._tag === "stderr") {
                    stderr += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
                  } else if (event._tag === "rawError") {
                    return fail(
                      HostFailure.make({
                        operation: "capture",
                        legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
                        cause: event.error,
                      })
                    );
                  } else if (event._tag === "complete") return complete(event.outcome);
                  return Effect.void;
                }),
              },
              childScope
            )
            .pipe(Effect.onError(() => Scope.close(childScope, Exit.void)));
          if (started._tag === "NativeSpawnFailure") {
            yield* Scope.close(childScope, Exit.void);
            return yield* HostFailure.make({
              operation: "capture",
              legacyMessage: started.error.message,
              cause: started.error,
            });
          }
          const run = started.run;
          yield* Effect.forkIn(
            run.awaitReaped.pipe(
              Effect.ensuring(Scope.close(childScope, Exit.void)),
              Effect.catchCause((cause) => Effect.logError("caption process cleanup failed", cause))
            ),
            owner,
            { startImmediately: true }
          );
          if (run.process.pid !== undefined) yield* lowerPriority(run.process.pid);
          return yield* Deferred.await(result).pipe(
            Effect.timeoutOrElse({
              duration: timeoutMs,
              orElse: Effect.fn("CaptionProcessOwner.timeout")(function* () {
                if (!settled) {
                  settled = true;
                  yield* run.process
                    .signalChild("SIGTERM")
                    .pipe(Effect.catch((error) => Effect.logError("caption timeout signal failed", error)));
                  yield* Deferred.fail(
                    result,
                    SourceUnavailable.make({
                      operation: "capture",
                      legacyMessage: `${spec.command} timed out after ${timeoutMs}ms`,
                    })
                  );
                }
                return yield* Deferred.await(result);
              }),
            })
          );
        }),
      });
    })
  );

export const layer = Layer.unwrap(TranscriptionHost.pipe(Effect.map((host) => makeLayer(host.lowerPriority))));
