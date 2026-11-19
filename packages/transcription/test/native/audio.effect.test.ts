import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as O from "effect/Option";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { layer as audioLayer } from "../../src/Audio.layer.js";
import { Audio, AudioAbort } from "../../src/Audio.service.js";
import { HostFailure } from "../../src/Transcription.errors.js";
import { TranscriptionFiles } from "../../src/TranscriptionFiles.service.js";
import { TranscriptionHost } from "../../src/TranscriptionHost.service.js";
import { TranscriptionProcess } from "../../src/TranscriptionProcess.service.js";
import { binaryLayer, layer as waveLayer } from "../../src/WaveReader.layer.js";
import { WaveReader } from "../../src/WaveReader.service.js";
import type { TranscriptionProcessSpec } from "../../src/TranscriptionProcess.model.js";

class AudioFixture extends Context.Service<
  AudioFixture,
  {
    readonly files: MutableHashMap.MutableHashMap<string, Uint8Array>;
    readonly calls: TranscriptionProcessSpec[];
    readonly priority: number[];
    mode: "normal" | "truncated" | "no-audio" | "failed-remux";
    reaped: number;
    removed: string[];
    cleanupError: boolean;
  }
>()("@vidbee/transcription/test/native/audio.effect.test/AudioFixture") {}
const state = Layer.sync(AudioFixture, () => ({
  files: MutableHashMap.make(
    ["/source", new Uint8Array([1])],
    ["/ffmpeg", new Uint8Array([1])],
    ["/ffprobe", new Uint8Array([1])]
  ),
  calls: [],
  priority: [],
  mode: "normal" as const,
  reaped: 0,
  removed: [],
  cleanupError: false,
}));
const files = Layer.effect(
  TranscriptionFiles,
  Effect.gen(function* () {
    const state = yield* AudioFixture;
    return TranscriptionFiles.of({
      exists: Effect.fn("fixture.exists")((path) => Effect.sync(() => MutableHashMap.has(state.files, path))),
      readBytes: Effect.fn("fixture.readBytes")((path) =>
        Effect.sync(() => O.getOrElse(MutableHashMap.get(state.files, path), () => new Uint8Array()))
      ),
      readText: Effect.fn("fixture.readText")(() => Effect.succeed("")),
      stat: Effect.fn("fixture.stat")((path) =>
        Effect.sync(() => ({
          size: O.getOrElse(MutableHashMap.get(state.files, path), () => new Uint8Array()).length,
          mtimeMs: 0,
          isDirectory: false,
          isFile: true,
        }))
      ),
      mkdir: Effect.fn("fixture.mkdir")(() => Effect.void),
      write: Effect.fn("fixture.write")(() => Effect.void),
      readDirectory: Effect.fn("fixture.readDirectory")(() => Effect.succeed([])),
      rename: Effect.fn("fixture.rename")(() => Effect.void),
      remove: Effect.fn("fixture.remove")((path) =>
        Effect.suspend(() => {
          state.removed.push(path);
          MutableHashMap.remove(state.files, path);
          return state.cleanupError
            ? Effect.fail(
                HostFailure.make({
                  operation: "remove",
                  legacyMessage: "cleanup failed",
                  cause: new Error("cleanup failed"),
                })
              )
            : Effect.void;
        })
      ),
      openRead: Effect.fn("fixture.openRead")(() => Effect.die("unused openRead")),
    });
  })
);
const host = Layer.effect(
  TranscriptionHost,
  Effect.gen(function* () {
    const state = yield* AudioFixture;
    return TranscriptionHost.of({
      snapshot: Effect.succeed({
        platform: "linux",
        arch: "x64",
        pid: 1,
        execPath: "/node",
        cwd: "/",
        temporaryDirectory: "/tmp",
        resourceDirectories: [],
        environment: {},
        cpuModel: "fixture",
        cpuCount: 1,
        ramBytes: 1,
        locale: "en",
        timeZone: "UTC",
      }),
      lowerPriority: Effect.fn("fixture.lowerPriority")((pid) =>
        Effect.sync(() => {
          state.priority.push(pid);
        })
      ),
      workerEnvironment: Effect.fn("fixture.workerEnvironment")(() => Effect.succeed({})),
      libraryDirectory: Effect.succeed(null),
      machine: Effect.fn("fixture.machine")(() => Effect.die("unused machine")),
      isProcessAlive: Effect.fn("fixture.isProcessAlive")(() => Effect.succeed(false)),
    });
  })
);
const process = Layer.effect(
  TranscriptionProcess,
  Effect.gen(function* () {
    const state = yield* AudioFixture;
    return TranscriptionProcess.of({
      start: Effect.fn("fixture.process")(function* (spec, sink, owner) {
        state.calls.push(spec);
        yield* Scope.addFinalizer(
          owner,
          Effect.sync(() => {
            state.reaped++;
          })
        );
        const duration = A.contains(spec.argv, "format=duration");
        const audio = A.contains(spec.argv, "stream=codec_type");
        let code = 0;
        if (duration) {
          const target = O.getOrElse(A.last(spec.argv), () => "/source");
          const text =
            target === "/source" ? "10" : state.mode === "truncated" || state.mode === "failed-remux" ? "1" : "10";
          yield* sink.emit({ _tag: "stdout", chunk: new TextEncoder().encode(text) });
        } else if (audio) {
          yield* sink.emit({
            _tag: "stdout",
            chunk: new TextEncoder().encode(state.mode === "no-audio" ? "" : "audio"),
          });
        } else {
          const target = O.getOrElse(A.last(spec.argv), () => "/out/audio-16k-mono.wav");
          MutableHashMap.set(state.files, target, new Uint8Array([1]));
          if (state.mode === "failed-remux" && target === "/out/audio-copy.m4a") code = 7;
          yield* sink.emit({ _tag: "stderr", chunk: new TextEncoder().encode(code === 0 ? "" : "copy failed") });
        }
        const outcome = { _tag: "Native" as const, result: { _tag: "ExitCode" as const, code } };
        yield* sink.emit({ _tag: "complete", outcome });
        return {
          _tag: "Acquired",
          run: {
            process: {
              observeClose: Effect.void,
              writeStdin: () => Effect.void,
              pid: 10,
              signalChild: () => Effect.void,
              signalGroup: () => Effect.void,
              signalTree: () => Effect.void,
              signalPid: () => Effect.void,
            },
            writeStdin: () => Effect.void,
            endInput: Effect.void,
            awaitReaped: Effect.succeed(outcome),
            terminate: () => Effect.void,
            signallingState: Effect.succeed({ _tag: "Native" }),
          },
        };
      }),
    });
  })
);
const aborts = Layer.succeed(AudioAbort, {
  subscribe: Effect.fn("fixture.subscribe")(() => Effect.succeed(Effect.void)),
});
const dependencies = Layer.mergeAll(files, host, process, aborts, LegacyTiming.layer, Path.layer);
const services = Layer.mergeAll(
  audioLayer.pipe(Layer.provide(waveLayer.pipe(Layer.provide(binaryLayer)))),
  waveLayer.pipe(Layer.provide(binaryLayer))
).pipe(Layer.provide(dependencies), Layer.provideMerge(state));
const chunk = (name: string, data: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(8 + data.length + (data.length % 2));
  for (let index = 0; index < 4; index++) bytes[index] = O.getOrElse(Str.charCodeAt(index)(name), () => 0);
  new DataView(bytes.buffer).setUint32(4, data.length, true);
  bytes.set(data, 8);
  return bytes;
};
const wav = (bits: number, channels: number, payload: Uint8Array) => {
  const format = new Uint8Array(16);
  const view = new DataView(format.buffer);
  view.setUint16(0, 1, true);
  view.setUint16(2, channels, true);
  view.setUint32(4, 8000, true);
  view.setUint16(14, bits, true);
  const fmt = chunk("fmt ", format);
  const data = chunk("data", payload);
  const bytes = new Uint8Array(12 + fmt.length + data.length);
  bytes.set([82, 73, 70, 70], 0);
  bytes.set([87, 65, 86, 69], 8);
  bytes.set(fmt, 12);
  bytes.set(data, 12 + fmt.length);
  return bytes;
};
layer(services, { buildPerTest: true })("native audio services", (it) => {
  it.effect("preserves conversion and probe argv, unread pipes, priority and reaping", () =>
    Effect.gen(function* () {
      const audio = yield* Audio;
      const state = yield* AudioFixture;
      const result = yield* audio.extract({ sourceFilePath: "/source", ffmpegPath: "/ffmpeg", outputDir: "/out" });
      expect(result).toEqual({ wavPath: "/out/audio-16k-mono.wav", durationMs: 10000 });
      expect(state.calls.length).toBe(4);
      expect(state.reaped).toBe(4);
      const probe = state.calls[0];
      expect(probe?.stdin).toBe("pipe");
      expect(probe?.stderrConsumption).toBe("unread");
      expect(probe?.stdoutConsumption).toBe("deliver");
      expect(probe?.detached).toBe(false);
      const convert = state.calls[2];
      expect(convert?.stdoutConsumption).toBe("unread");
      expect(convert?.stderrConsumption).toBe("deliver");
      expect(convert?.stdin).toBe("ignore");
      expect(convert?.detached).toBe(true);
      expect(convert?.argv).toEqual([
        "-y",
        "-i",
        "/source",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-threads",
        "2",
        "-vn",
        "/out/audio-16k-mono.wav",
      ]);
      expect(state.priority).toEqual([10]);
    })
  );
  it.effect("retains cache reuse before audio detection and no-audio failure before conversion", () =>
    Effect.gen(function* () {
      const audio = yield* Audio;
      const state = yield* AudioFixture;
      MutableHashMap.set(state.files, "/out/audio-16k-mono.wav", new Uint8Array([1]));
      const reused = yield* audio.extract({ sourceFilePath: "/source", ffmpegPath: "/ffmpeg", outputDir: "/out" });
      expect(reused.durationMs).toBe(10000);
      expect(state.calls.length).toBe(2);
      MutableHashMap.remove(state.files, "/out/audio-16k-mono.wav");
      state.mode = "no-audio";
      const failed = yield* audio
        .extract({ sourceFilePath: "/source", ffmpegPath: "/ffmpeg", outputDir: "/out" })
        .pipe(Effect.flip);
      expect(failed.legacyMessage).toBe("source has no audio stream");
      expect(state.calls.length).toBe(4);
    })
  );
  it.effect("remux cleanup failure takes precedence over conversion failure", () =>
    Effect.gen(function* () {
      const audio = yield* Audio;
      const state = yield* AudioFixture;
      state.mode = "failed-remux";
      state.cleanupError = true;
      const failed = yield* audio
        .extract({ sourceFilePath: "/source", ffmpegPath: "/ffmpeg", outputDir: "/out" })
        .pipe(Effect.flip);
      expect(failed.legacyMessage).toBe("cleanup failed");
      expect(state.removed).toEqual(["/out/audio-copy.m4a"]);
    })
  );
  it.effect("one native parser averages channels, retains zero-channel NaN and masks ASCII high bits", () =>
    Effect.gen(function* () {
      const wave = yield* WaveReader;
      const state = yield* AudioFixture;
      const bytes = wav(8, 2, new Uint8Array([0, 255, 128, 128]));
      bytes[0] = 210;
      MutableHashMap.set(state.files, "/wave", bytes);
      const decoded = yield* wave.read("/wave");
      expect(decoded.sampleRate).toBe(8000);
      expect(A.fromIterable(decoded.samples)).toEqual([-0.00390625, 0]);
      MutableHashMap.set(state.files, "/wave", wav(16, 0, new Uint8Array([0, 0])));
      const zero = yield* wave.read("/wave");
      expect(Number.isNaN(zero.samples[0])).toBe(true);
      MutableHashMap.set(state.files, "/wave", wav(24, 1, new Uint8Array(6)));
      const failed = yield* wave.read("/wave").pipe(Effect.flip);
      expect(failed.legacyMessage).toBe("unsupported wav bit depth: 24");
    })
  );
});
