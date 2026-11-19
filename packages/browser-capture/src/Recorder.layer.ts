import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Str from "effect/String";
import { CaptureProcessFailure, HostFailure } from "./Capture.errors.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { Recorder } from "./Recorder.service.js";
import { buildRecorderArgs } from "./recorder.js";
import type { CaptureError } from "./Capture.errors.js";

const failure = (cause: { readonly legacyMessage: string; readonly cause?: unknown }) =>
  HostFailure.make({ operation: "process", legacyMessage: cause.legacyMessage, cause: cause.cause ?? cause });
export const RecorderLive = Layer.effect(
  Recorder,
  Effect.gen(function* () {
    const process = yield* DownloadProcess;
    const timing = yield* LegacyTiming;
    const timers = yield* CaptureTimers;
    return Recorder.of({
      scan: Effect.fn("Recorder.scan")(function* (input) {
        const completed = yield* Deferred.make<Uint8Array, CaptureError>();
        const chunks: Uint8Array[] = [];
        let stderr = "";
        const started = yield* process
          .start(
            {
              command: input.ffmpegPath,
              argv: [
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "x11grab",
                "-video_size",
                `${input.scanWidth}x${input.scanHeight}`,
                "-i",
                `${input.display}.0+0,0`,
                "-frames:v",
                "1",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-",
              ],
              env: undefined,
              extendEnv: true,
              cwd: undefined,
              detached: false,
              windowsHide: false,
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
              rawExitObservation: "omit",
            },
            {
              abort: Effect.void,
              emit: Effect.fn("Recorder.scanEvent")(function* (event) {
                if (event._tag === "stdout") chunks.push(event.chunk);
                if (event._tag === "stderr") stderr += new TextDecoder().decode(event.chunk);
                if (event._tag === "rawError")
                  yield* Deferred.fail(
                    completed,
                    HostFailure.make({
                      operation: "scan",
                      cause: event.error,
                      legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
                    })
                  );
                if (event._tag === "complete") {
                  const outcome = event.outcome;
                  if (outcome._tag === "Native" && outcome.result._tag === "Failure") {
                    yield* Deferred.fail(
                      completed,
                      HostFailure.make({
                        operation: "scan",
                        cause: outcome.result.error,
                        legacyMessage: outcome.result.error.message,
                      })
                    );
                    return;
                  }
                  const okay =
                    outcome._tag === "Raw"
                      ? outcome.code === 0
                      : outcome.result._tag === "ExitCode" && outcome.result.code === 0;
                  if (!okay) {
                    yield* Deferred.fail(
                      completed,
                      CaptureProcessFailure.make({
                        operation: "scan",
                        legacyMessage: `Failed to read the capture display: ${Str.trim(stderr)}`,
                      })
                    );
                    return;
                  }
                  let size = 0;
                  for (const chunk of chunks) size += chunk.length;
                  const raw = new Uint8Array(size);
                  let offset = 0;
                  for (const chunk of chunks) {
                    raw.set(chunk, offset);
                    offset += chunk.length;
                  }
                  yield* Deferred.succeed(completed, raw);
                }
              }),
            }
          )
          .pipe(Effect.mapError(failure));
        if (started._tag === "NativeSpawnFailure")
          return yield* HostFailure.make({
            operation: "scan",
            cause: started.error,
            legacyMessage: started.error.message,
          });
        const raw = yield* Deferred.await(completed).pipe(Effect.ensuring(timing.turn("scan.bytes")));
        for (let y = 0; y < input.scanHeight; y += 1)
          for (let x = 0; x < input.scanWidth; x += 1) {
            const offset = (y * input.scanWidth + x) * 3;
            if ((raw[offset] ?? 0) > 240 && (raw[offset + 1] ?? 0) < 30 && (raw[offset + 2] ?? 0) > 240)
              return { x, y };
          }
        return { x: 0, y: 0 };
      }),
      start: Effect.fn("Recorder.start")(function* (input) {
        const callbacks: Array<Effect.Effect<void>> = [];
        const started = yield* process
          .start(
            {
              command: input.ffmpegPath,
              argv: buildRecorderArgs(input),
              env: input.env,
              extendEnv: false,
              cwd: undefined,
              detached: false,
              windowsHide: false,
              stdin: "pipe",
              stdout: "ignore",
              stderr: "pipe",
              stderrConsumption: "unread",
              rawErrorObservation: "omit",
              rawExitObservation: "omit",
              rawCloseObservation: "on-demand",
            },
            {
              abort: Effect.void,
              emit: Effect.fn("Recorder.event")(function* (event) {
                if (event._tag !== "complete") return;
                const pending = callbacks.splice(0);
                for (const callback of pending) yield* callback;
              }),
            }
          )
          .pipe(Effect.mapError(failure));
        if (started._tag === "NativeSpawnFailure" || !Predicate.isTruthy(started.run.pid))
          return yield* CaptureProcessFailure.make({
            operation: "startRecorder",
            legacyMessage: "Failed to start ffmpeg recorder",
            cause: started._tag === "NativeSpawnFailure" ? started.error : undefined,
          });
        return {
          stop: Effect.gen(function* () {
            const done = yield* Deferred.make<void>();
            const cancel = yield* timers.after(
              4000,
              started.run
                .signalChild("SIGKILL")
                .pipe(Effect.ignore, Effect.andThen(Deferred.succeed(done, undefined)), Effect.asVoid),
              { keepAlive: true }
            );
            callbacks.push(cancel.pipe(Effect.andThen(Deferred.succeed(done, undefined)), Effect.asVoid));
            yield* started.run.observeClose.pipe(Effect.mapError(failure));
            yield* started.run.writeStdin(new Uint8Array([113])).pipe(Effect.ignore);
            yield* started.run
              .signalChild("SIGINT")
              .pipe(Effect.catch(() => cancel.pipe(Effect.andThen(Deferred.succeed(done, undefined)), Effect.asVoid)));
            yield* Deferred.await(done);
            yield* timing.turn("recorder.stop.await");
          }),
        };
      }),
    });
  })
);
