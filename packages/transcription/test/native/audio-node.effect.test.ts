import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { layer as capabilitiesLayer } from "@vidbee/downloader-core/ProcessCapabilities.layer";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { abortLayer, layer as audioLayer } from "../../src/Audio.layer.js";
import { Audio } from "../../src/Audio.service.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionHost } from "../../src/TranscriptionHost.service.js";
import { layer as processLayer } from "../../src/TranscriptionProcess.layer.js";
import { binaryLayer, layer as waveLayer } from "../../src/WaveReader.layer.js";
import { pinnedNode } from "../fixtures/pinned-node.js";

const host = Layer.succeed(TranscriptionHost, {
  snapshot: Effect.succeed({
    platform: "linux",
    arch: "x64",
    pid: 1,
    execPath: "/fixture/node",
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
  lowerPriority: Effect.fn("fixture.lowerPriority")(() => Effect.void),
  workerEnvironment: Effect.fn("fixture.workerEnvironment")(() => Effect.succeed({})),
  libraryDirectory: Effect.succeed(null),
  machine: Effect.fn("fixture.machine")(() => Effect.die("unused machine")),
  isProcessAlive: Effect.fn("fixture.isProcessAlive")(() => Effect.succeed(false)),
});
const nativeProcess = processLayer.pipe(Layer.provide(capabilitiesLayer), Layer.provide(requestLayer));
const nativeWave = waveLayer.pipe(Layer.provide(binaryLayer), Layer.provide(TranscriptionFilesLive));
const services = audioLayer.pipe(
  Layer.provide(nativeWave),
  Layer.provide(nativeProcess),
  Layer.provide(TranscriptionFilesLive),
  Layer.provide(host),
  Layer.provide(abortLayer),
  Layer.provide(LegacyTiming.layer),
  Layer.provideMerge(NodeServices.layer)
);
layer(services)("native audio real process", (it) => {
  it.effect(
    "decodes via real process observations and reuses the output on the next extraction",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const audio = yield* Audio;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "audio-native-" });
        const node = yield* pinnedNode;
        const ffmpeg = path.join(root, "ffmpeg");
        const ffprobe = path.join(root, "ffprobe");
        const source = path.join(root, "source");
        const out = path.join(root, "out");
        yield* fs.writeFileString(source, "fixture source");
        const bytes = new Uint8Array(48);
        const view = new DataView(bytes.buffer);
        bytes.set([82, 73, 70, 70], 0);
        bytes.set([87, 65, 86, 69], 8);
        bytes.set([102, 109, 116, 32], 12);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true);
        view.setUint16(34, 16, true);
        bytes.set([100, 97, 116, 97], 36);
        view.setUint32(40, 4, true);
        view.setInt16(44, 16384, true);
        view.setInt16(46, -16384, true);
        const byteNumbers = A.fromIterable(bytes);
        const byteStrings = A.map(byteNumbers, String);
        const array = A.join(byteStrings, ",");
        yield* fs.writeFileString(
          ffmpeg,
          `#!${node}\nconst fs=require('node:fs');fs.writeFileSync(process.argv.at(-1),Buffer.from([${array}]));`
        );
        yield* fs.chmod(ffmpeg, 0o755);
        yield* fs.writeFileString(
          ffprobe,
          `#!${node}\nprocess.stdout.write(process.argv.includes('stream=codec_type')?'audio':'1');`
        );
        yield* fs.chmod(ffprobe, 0o755);
        const extracted = yield* audio.extract({ sourceFilePath: source, ffmpegPath: ffmpeg, outputDir: out });
        expect(extracted.durationMs).toBe(1000);
        const decoded = yield* audio.readPcm(extracted.wavPath);
        expect(decoded.sampleRate).toBe(16000);
        expect(decoded.samples[0]).toBe(0.5);
        expect(decoded.samples[1]).toBe(-0.5);
        yield* fs.writeFileString(ffmpeg, `#!${node}\nthrow new Error('cache should avoid conversion')`);
        const reused = yield* audio.extract({ sourceFilePath: source, ffmpegPath: ffmpeg, outputDir: out });
        expect(reused).toEqual(extracted);
      }),
    { timeout: 30000 }
  );
});
