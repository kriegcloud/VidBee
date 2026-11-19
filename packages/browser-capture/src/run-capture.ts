import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import { CaptureUnavailable } from "./Capture.errors.js";
import { Capture } from "./Capture.service.js";
import { CaptureFiles } from "./CaptureFiles.service.js";
import { CaptureHost } from "./CaptureHost.service.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { parseNetscapeCookieFile, toPlaywrightCookies } from "./cookies.js";
import { Playback } from "./Playback.service.js";
import { evenSize } from "./quality.js";
import { Recorder } from "./Recorder.service.js";
import { VirtualDisplay } from "./VirtualDisplay.service.js";
import type { PlaybackSession } from "./Playback.service.js";
import type { RecorderHandle } from "./Recorder.service.js";
export const CaptureLive = Layer.effect(
  Capture,
  Effect.gen(function* () {
    const files = yield* CaptureFiles;
    const timing = yield* LegacyTiming;
    const host = yield* CaptureHost;
    const timers = yield* CaptureTimers;
    const playbackService = yield* Playback;
    const recorderService = yield* Recorder;
    const displays = yield* VirtualDisplay;
    return Capture.of({
      run: Effect.fn("Capture.run")(function* (job, signal, sink) {
        const cookieText =
          job.cookiesPath !== undefined && Predicate.isTruthy(job.cookiesPath)
            ? yield* files.readText(job.cookiesPath)
            : null;
        const rows = cookieText === null ? null : parseNetscapeCookieFile(cookieText);
        const cookies = rows === null ? [] : toPlaywrightCookies(rows, Math.floor((yield* timers.now) / 1000));
        if (job.browserExecutable === undefined || !Predicate.isTruthy(job.browserExecutable))
          return yield* CaptureUnavailable.make({
            operation: "capture",
            legacyMessage: "No Chromium-family browser found to play DRM media",
          });
        const display = yield* displays.start({ width: job.width, height: job.height });
        yield* timing.turn("capture.display");
        // Logging precedes the old try/finally; an exception here intentionally leaks the display.
        yield* sink.log(`Virtual display ${display.display} ready`);
        let recorder: RecorderHandle | null = null;
        let playback: PlaybackSession | null = null;
        const work = Effect.fnUntraced(function* () {
          playback = yield* playbackService.start(
            {
              url: job.url,
              cookies,
              localStorage: job.localStorage,
              executablePath: job.browserExecutable ?? "",
              display: display.display,
              pulseSink: display.pulseSink,
              width: job.width,
              height: job.height,
              signal,
              userDataDir: job.userDataDir,
              videoOrdinal: job.videoOrdinal,
              ffmpegPath: job.ffmpegPath,
            },
            { log: sink.log }
          );
          yield* timing.turn("capture.playback.start");
          yield* sink.log("Waiting for in-browser playback (CDM decrypts in Chromium)");
          const playing = yield* playback.waitUntilPlaying;
          yield* timing.turn("capture.playing");
          const durationHint = job.durationHintSec ?? playing.duration;
          const native = evenSize(
            playing.width > 0 ? playing.width : job.width,
            playing.height > 0 ? playing.height : job.height
          );
          const grabWidth = Math.min(native.width, job.width);
          const grabHeight = Math.min(native.height, job.height);
          yield* sink.log(
            `Pinned decoded quality ${grabWidth}x${grabHeight}${Predicate.isTruthy(playing.method) ? ` (${playing.method})` : ""}`
          );
          yield* timers.sleep(350);
          const snapshot = yield* host.snapshot;
          const env = {
            ...snapshot.environment,
            DISPLAY: display.display,
            ...(Predicate.isTruthy(display.pulseSink) ? { PULSE_SINK: display.pulseSink } : {}),
          };
          const startWithAudio = Predicate.isTruthy(display.pulseSink);
          const recorderInput = {
            ffmpegPath: job.ffmpegPath,
            display: display.display,
            width: grabWidth,
            height: grabHeight,
            outputPath: job.outputPath,
            pulseSink: display.pulseSink,
            fps: playing.fps,
            originX: playing.originX,
            originY: playing.originY,
            env,
          };
          recorder = yield* recorderService.start({ ...recorderInput, includeAudio: startWithAudio }).pipe(
            Effect.catch((error) => {
              if (!startWithAudio) return Effect.fail(error);
              return sink
                .log("Pulse capture failed; recording video only")
                .pipe(Effect.andThen(recorderService.start({ ...recorderInput, includeAudio: false })));
            })
          );
          yield* sink.log("ffmpeg x11grab started");
          yield* playback.waitUntilEnded((state) => {
            const duration = state.duration || durationHint || 0;
            const percent = duration > 0 ? Math.min(1, state.currentTime / duration) : 0;
            return sink.progress({ currentTime: state.currentTime, duration, percent });
          });
          yield* timing.turn("capture.ended");
          yield* timers.sleep(400);
        });
        const cleanup = Effect.fnUntraced(function* () {
          if (recorder !== null) yield* recorder.stop;
          if (playback !== null) {
            yield* playback.close;
            yield* timing.turn("capture.playback.close");
          }
          yield* display.stop;
          yield* timing.turn("capture.display.stop");
        });
        // Sequential finally preserves failure precedence: a failing cleanup replaces
        // the original failure and prevents all subsequent cleanup operations.
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const result = yield* Effect.exit(restore(work()));
            const cleaned = yield* Effect.exit(cleanup());
            if (Exit.isFailure(cleaned)) return yield* Effect.failCause(cleaned.cause);
            if (Exit.isFailure(result)) return yield* Effect.failCause(result.cause);
            return {
              filePath: job.outputPath,
              durationMs: Predicate.isTruthy(job.durationHintSec)
                ? Math.round((job.durationHintSec ?? 0) * 1000)
                : null,
            };
          })
        );
      }),
    });
  })
);
