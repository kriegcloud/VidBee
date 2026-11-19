import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Str from "effect/String";
import { waitForDisplay } from "./availability.js";
import { DisplayUnavailable, HostFailure } from "./Capture.errors.js";
import { CaptureHost } from "./CaptureHost.service.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { VirtualDisplay } from "./VirtualDisplay.service.js";

const failure = (cause: { readonly legacyMessage: string; readonly cause?: unknown }) =>
  HostFailure.make({ operation: "spawn", legacyMessage: cause.legacyMessage, cause: cause.cause ?? cause });
export const VirtualDisplayLive = Layer.effect(
  VirtualDisplay,
  Effect.gen(function* () {
    const host = yield* CaptureHost;
    const timing = yield* LegacyTiming;
    const process = yield* DownloadProcess;
    const timers = yield* CaptureTimers;
    const runPactl = Effect.fn("VirtualDisplay.pactl")(function* (argv: string[]) {
      const pactl = yield* host.pactl;
      if (pactl === null || !Predicate.isTruthy(pactl)) return "";
      const completed = yield* Deferred.make<string>();
      let stdout = "";
      const started = yield* process
        .start(
          {
            command: pactl,
            argv,
            env: undefined,
            extendEnv: true,
            cwd: undefined,
            detached: false,
            windowsHide: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            stderrConsumption: "unread",
            rawExitObservation: "omit",
          },
          {
            abort: Effect.void,
            emit: Effect.fn("VirtualDisplay.pactlEvent")(function* (event) {
              if (event._tag === "stdout") stdout += new TextDecoder().decode(event.chunk);
              if (event._tag === "rawError") yield* Deferred.succeed(completed, "");
              if (event._tag === "complete") {
                const outcome = event.outcome;
                const okay =
                  outcome._tag === "Raw"
                    ? outcome.code === 0
                    : outcome.result._tag === "ExitCode" && outcome.result.code === 0;
                yield* Deferred.succeed(completed, okay ? Str.trim(stdout) : "");
              }
            }),
          }
        )
        .pipe(Effect.mapError(failure));
      if (started._tag === "NativeSpawnFailure") return "";
      const result = yield* Deferred.await(completed);
      yield* timing.turn("pactl.result");
      return result;
    });
    return VirtualDisplay.of({
      start: Effect.fn("VirtualDisplay.start")(function* (input) {
        const xvfb = yield* host.xvfb;
        if (xvfb === null || !Predicate.isTruthy(xvfb))
          return yield* DisplayUnavailable.make({
            operation: "start",
            legacyMessage: "Xvfb not found. Install xvfb to record DRM playback.",
          });
        const number = yield* host.displayNumber;
        const display = `:${number}`;
        const started = yield* process
          .start(
            {
              command: xvfb,
              argv: [display, "-screen", "0", `${input.width}x${input.height}x24`, "-ac", "-nolisten", "tcp"],
              env: undefined,
              extendEnv: true,
              cwd: undefined,
              detached: false,
              windowsHide: false,
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
              rawErrorObservation: "omit",
              rawExitObservation: "omit",
              rawCloseObservation: "omit",
            },
            { abort: Effect.void, emit: () => Effect.void }
          )
          .pipe(Effect.mapError(failure));
        if (started._tag === "NativeSpawnFailure" || !Predicate.isTruthy(started.run.pid))
          return yield* DisplayUnavailable.make({
            operation: "start",
            legacyMessage: "Failed to start Xvfb",
            cause: started._tag === "NativeSpawnFailure" ? started.error : undefined,
          });
        const ready = waitForDisplay(display).pipe(
          Effect.provideService(CaptureHost, host),
          Effect.provideService(CaptureTimers, timers)
        );
        yield* ready;
        yield* timing.turn("display.ready");
        const pulseName = `vidbee_cap_${number}`;
        const pulseModuleId = yield* runPactl([
          "load-module",
          "module-null-sink",
          `sink_name=${pulseName}`,
          `sink_properties=device.description=${pulseName}`,
        ]);
        return {
          display,
          pulseSink: Predicate.isTruthy(pulseModuleId) ? pulseName : undefined,
          stop: Effect.gen(function* () {
            if (Predicate.isTruthy(pulseModuleId)) {
              yield* runPactl(["unload-module", pulseModuleId]);
              yield* timing.turn("display.unload");
            }
            yield* started.run.signalPid("SIGTERM");
            yield* timers.sleep(200);
            yield* started.run.signalPid("SIGKILL");
          }),
        };
      }),
    });
  })
);
