import { expect, layer } from "@effect/vitest";
import { HostFailure as ProcessHostFailure } from "@vidbee/downloader-core/Downloader.errors";
import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { CaptureProcessFailure } from "../src/Capture.errors.js";
import { CaptureLive } from "../src/Capture.layer.js";
import { Capture } from "../src/Capture.service.js";
import { CaptureFiles } from "../src/CaptureFiles.service.js";
import { CaptureHost } from "../src/CaptureHost.service.js";
import { CaptureTimers } from "../src/CaptureTimers.service.js";
import { Playback } from "../src/Playback.service.js";
import { RecorderLive } from "../src/Recorder.layer.js";
import { Recorder } from "../src/Recorder.service.js";
import { VirtualDisplayLive } from "../src/VirtualDisplay.layer.js";
import { VirtualDisplay } from "../src/VirtualDisplay.service.js";
import type { ProcessSpec } from "@vidbee/downloader-core/Process.model";
import type { CaptureError } from "../src/Capture.errors.js";

const captureSignal = new AbortController().signal;
class Fixture extends Context.Service<
  Fixture,
  {
    readonly trace: string[];
    readonly specs: ProcessSpec[];
    alarm: Effect.Effect<void, CaptureError>;
    close: Effect.Effect<void>;
    audioFailure: boolean;
    recorderClose: boolean;
    cleanupFailure: boolean;
  }
>()("@vidbee/browser-capture/test/platform.effect.test/Fixture") {}
const fixture = Layer.sync(Fixture, () => ({
  trace: [],
  specs: [],
  alarm: Effect.void,
  close: Effect.void,
  audioFailure: false,
  recorderClose: true,
  cleanupFailure: false,
}));
const dependencies = Layer.effect(
  DownloadProcess,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return DownloadProcess.of({
      start: Effect.fn("fixture.spawn")(function* (spec, sink) {
        state.specs.push(spec);
        state.trace.push(`spawn:${spec.command}`);
        if (state.audioFailure && spec.command === "ffmpeg" && spec.argv.includes("pulse"))
          return yield* ProcessHostFailure.make({ operation: "spawn", legacyMessage: "audio failed" });
        if (spec.command === "pactl") {
          yield* sink.emit({ _tag: "stdout", chunk: new TextEncoder().encode("  23\n") });
          yield* sink.emit({ _tag: "complete", outcome: { _tag: "Raw", code: 0, signal: null, killed: false } });
        }
        if (spec.argv.includes("rawvideo")) {
          yield* sink.emit({ _tag: "stdout", chunk: new Uint8Array([0, 0, 0, 0, 0, 0]) });
          yield* sink.emit({ _tag: "stdout", chunk: new Uint8Array([255, 0, 255]) });
          yield* sink.emit({ _tag: "complete", outcome: { _tag: "Raw", code: 0, signal: null, killed: false } });
        }
        return {
          _tag: "Acquired",
          run: {
            pid: 42,
            writeStdin: Effect.fn("fixture.writeStdin")((bytes) =>
              Effect.sync(() => {
                state.trace.push(`stdin:${bytes[0]}`);
              })
            ),
            observeClose: Effect.sync(() => {
              state.trace.push("observeClose");
              state.close = sink.emit({
                _tag: "complete",
                outcome: { _tag: "Raw", code: 0, signal: null, killed: false },
              });
            }),
            signalChild: Effect.fn("fixture.signalChild")((signal) =>
              Effect.gen(function* () {
                state.trace.push(`child:${signal}`);
                if (signal === "SIGINT" && state.recorderClose) yield* state.close;
              })
            ),
            signalPid: Effect.fn("fixture.signalPid")((signal) =>
              Effect.sync(() => {
                state.trace.push(`pid:${signal}`);
              })
            ),
            signalGroup: () => Effect.void,
            signalTree: () => Effect.void,
          },
        };
      }),
    });
  })
);
const host = Layer.succeed(
  CaptureHost,
  CaptureHost.of({
    available: Effect.succeed(true),
    browser: Effect.fn("fixture.browser")(() => Effect.succeed("chromium")),
    xvfb: Effect.succeed("Xvfb"),
    pactl: Effect.succeed("pactl"),
    displayNumber: Effect.succeed(90),
    makeAbortController: () => new AbortController(),
    snapshot: Effect.succeed({
      platform: "linux",
      home: "/fixture/home",
      temp: "/fixture/tmp",
      execPath: "/fixture/node",
      pid: 42,
      environment: { FIXTURE: "yes" },
    }),
    probeDisplay: Effect.fn("fixture.probeDisplay")(() => Effect.succeed(true)),
  })
);
const timers = Layer.effect(
  CaptureTimers,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return CaptureTimers.of({
      now: Effect.succeed(1000),
      sleep: Effect.fn("fixture.sleep")((ms) =>
        Effect.sync(() => {
          state.trace.push(`sleep:${ms}`);
        })
      ),
      defer: Effect.fn("fixture.defer")((action) => action.pipe(Effect.ignore)),
      after: Effect.fn("fixture.after")((ms, action, options) =>
        Effect.sync(() => {
          state.trace.push(`timer:${ms}:${options.keepAlive}`);
          state.alarm = action;
          return Effect.sync(() => {
            state.trace.push("cancelTimer");
          });
        })
      ),
    });
  })
);
const noop = Effect.fn("fixture.noop")(() => Effect.void);
const files = Layer.succeed(
  CaptureFiles,
  CaptureFiles.of({
    readText: Effect.fn("fixture.readText")(() => Effect.succeed("")),
    readBytes: Effect.fn("fixture.readBytes")(() => Effect.succeed(new Uint8Array())),
    exists: Effect.fn("fixture.exists")(() => Effect.succeed(false)),
    stat: Effect.fn("fixture.stat")(() => Effect.succeed({ size: 1, isFile: true, isDirectory: false })),
    list: Effect.fn("fixture.list")(() => Effect.succeed([])),
    mkdir: noop,
    tempDirectory: Effect.fn("fixture.tempDirectory")(() => Effect.succeed("/fixture/tmp/capture")),
    copy: noop,
    write: noop,
    rename: noop,
    remove: noop,
  })
);
const playback = Layer.effect(
  Playback,
  Effect.gen(function* () {
    const state = yield* Fixture;
    return Playback.of({
      start: Effect.fn("fixture.playbackStart")(() =>
        Effect.succeed({
          mediaId: null,
          waitUntilPlaying: Effect.succeed({
            width: 4,
            height: 6,
            fps: 30,
            method: "fixture",
            duration: 2,
            originX: 1,
            originY: 2,
          }),
          waitUntilEnded: (progress) => progress({ currentTime: 1, duration: 0 }),
          close: Effect.suspend(() => {
            state.trace.push("playback.close");
            return state.cleanupFailure
              ? Effect.fail(CaptureProcessFailure.make({ operation: "close", legacyMessage: "cleanup failed" }))
              : Effect.void;
          }),
        })
      ),
    });
  })
);
const base = Layer.mergeAll(dependencies, host, timers, files, playback, LegacyTiming.layer).pipe(
  Layer.provideMerge(fixture)
);
const platform = Layer.mergeAll(RecorderLive, VirtualDisplayLive).pipe(Layer.provideMerge(base));
const live = CaptureLive.pipe(Layer.provideMerge(platform));
layer(live)("shared capture platform", (it) => {
  it.effect("scan joins original byte chunks and retains scan policies", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      state.specs.length = 0;
      const service = yield* Recorder;
      const position = yield* service.scan({ ffmpegPath: "ffmpeg", display: ":90", scanWidth: 2, scanHeight: 2 });
      expect(position).toEqual({ x: 0, y: 1 });
      expect(state.specs[0]).toMatchObject({
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        rawExitObservation: "omit",
      });
    })
  );
  it.effect("recorder arms timer, observes late close, writes q then signals without ending input", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      state.trace.length = 0;
      const service = yield* Recorder;
      const handle = yield* service.start({
        ffmpegPath: "ffmpeg",
        display: ":90",
        width: 4,
        height: 6,
        outputPath: "/fixture/out.mp4",
        includeAudio: false,
      });
      expect(state.trace).toEqual(["spawn:ffmpeg"]);
      yield* handle.stop;
      expect(state.trace).toEqual([
        "spawn:ffmpeg",
        "timer:4000:true",
        "observeClose",
        "stdin:113",
        "child:SIGINT",
        "cancelTimer",
      ]);
      expect(state.specs[state.specs.length - 1]).toMatchObject({
        stderr: "pipe",
        stderrConsumption: "unread",
        rawErrorObservation: "omit",
        rawCloseObservation: "on-demand",
      });
    })
  );
  it.effect("display unload precedes PID TERM, delay and PID KILL", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      state.trace.length = 0;
      const service = yield* VirtualDisplay;
      const display = yield* service.start({ width: 4, height: 6 });
      expect(display.pulseSink).toBe("vidbee_cap_90");
      yield* display.stop;
      expect(state.trace).toEqual([
        "spawn:Xvfb",
        "spawn:pactl",
        "spawn:pactl",
        "pid:SIGTERM",
        "sleep:200",
        "pid:SIGKILL",
      ]);
    })
  );
  it.effect("capture retries only synchronous audio start failure and closes sequentially", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      state.trace.length = 0;
      state.audioFailure = true;
      state.cleanupFailure = false;
      const service = yield* Capture;
      const result = yield* service.run(
        {
          url: "https://fixture.invalid",
          outputPath: "/fixture/out.mp4",
          ffmpegPath: "ffmpeg",
          browserExecutable: "chromium",
          width: 4,
          height: 6,
          durationHintSec: 3,
        },
        captureSignal,
        {
          log: (message) =>
            Effect.sync(() => {
              state.trace.push(message);
            }),
          progress: (progress) =>
            Effect.sync(() => {
              state.trace.push(`progress:${progress.duration}:${progress.percent}`);
            }),
        }
      );
      expect(result).toEqual({ filePath: "/fixture/out.mp4", durationMs: 3000 });
      expect(state.trace).toContain("Pulse capture failed; recording video only");
      expect(state.trace).toContain("progress:3:0.3333333333333333");
      expect(state.trace.slice(-6)).toEqual([
        "cancelTimer",
        "playback.close",
        "spawn:pactl",
        "pid:SIGTERM",
        "sleep:200",
        "pid:SIGKILL",
      ]);
      state.audioFailure = false;
    })
  );
  it.effect("a playback cleanup failure replaces failure and skips display cleanup", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      state.trace.length = 0;
      state.cleanupFailure = true;
      const service = yield* Capture;
      const result = yield* Effect.result(
        service.run(
          {
            url: "https://fixture.invalid",
            outputPath: "/fixture/out.mp4",
            ffmpegPath: "ffmpeg",
            browserExecutable: "chromium",
            width: 4,
            height: 6,
          },
          captureSignal,
          {
            log: () => Effect.void,
            progress: () =>
              Effect.fail(CaptureProcessFailure.make({ operation: "progress", legacyMessage: "progress failed" })),
          }
        )
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure.legacyMessage).toBe("cleanup failed");
      expect(state.trace[state.trace.length - 1]).toBe("playback.close");
      state.cleanupFailure = false;
    })
  );
  it.effect("recorder timeout requests KILL and resolves without waiting for close", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      state.trace.length = 0;
      state.recorderClose = false;
      const service = yield* Recorder;
      const handle = yield* service.start({
        ffmpegPath: "ffmpeg",
        display: ":90",
        width: 4,
        height: 6,
        outputPath: "/fixture/out.mp4",
        includeAudio: false,
      });
      const scope = yield* Effect.scope;
      const stopping = yield* Effect.forkIn(handle.stop, scope, { startImmediately: true });
      expect(state.trace).toEqual(["spawn:ffmpeg", "timer:4000:true", "observeClose", "stdin:113", "child:SIGINT"]);
      yield* state.alarm;
      yield* Fiber.join(stopping);
      expect(state.trace[state.trace.length - 1]).toBe("child:SIGKILL");
      yield* state.close;
      expect(state.trace[state.trace.length - 1]).toBe("cancelTimer");
      state.recorderClose = true;
    })
  );
});
