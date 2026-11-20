import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer as testLayer } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { layer as extractionLayer, probeReaderLayer } from "../../src/CaptionExtraction.layer.js";
import { CaptionExtraction, CaptionProbeReader } from "../../src/CaptionExtraction.service.js";
import { CaptionProcessOwner } from "../../src/CaptionProcessOwner.service.js";
import { SourceUnavailable } from "../../src/Transcription.errors.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import type { TranscriptionProcessSpec } from "../../src/TranscriptionProcess.model.js";

class CaptionFixture extends Context.Service<
  CaptionFixture,
  {
    readonly service: typeof CaptionExtraction.Service;
    readonly ffmpegPath: string;
    readonly filePath: string;
    readonly calls: readonly string[];
  }
>()("@vidbee/transcription/test/native/caption-extraction.effect.test/CaptionFixture") {}
const fixtureLayer = Layer.effect(
  CaptionFixture,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const ffmpegPath = path.join(root, "ffmpeg");
    const filePath = path.join(root, "source");
    for (const name of [ffmpegPath, filePath, path.join(root, "ffprobe")]) yield* fs.writeFileString(name, "fixture");
    const calls: string[] = [];
    const owner = Layer.succeed(CaptionProcessOwner, {
      capture: Effect.fn("fixture.capture")(function* (spec: TranscriptionProcessSpec) {
        calls.push(spec.command);
        if (spec.command === path.join(root, "ffprobe"))
          return '{"streams":[{"index":1,"codec_type":"subtitle","codec_name":"srt","tags":{"language":"fra"}},{"index":2,"codec_type":"subtitle","codec_name":"srt","tags":{"language":"en"}},{"index":3,"codec_type":"subtitle","codec_name":"srt","tags":{"language":"ai-zh"}},{"index":4,"codec_type":"subtitle","codec_name":"srt","tags":{"language":"zh"}}]}';
        if (spec.argv.includes("0:2")) return "English\n";
        if (spec.argv.includes("0:4")) return "  \n";
        return yield* SourceUnavailable.make({ operation: "fixture", legacyMessage: "failed track" });
      }),
    });
    const services = extractionLayer.pipe(
      Layer.provide(owner),
      Layer.provide(probeReaderLayer),
      Layer.provide(TranscriptionFilesLive)
    );
    const scope = yield* Effect.scope;
    const context = yield* Layer.buildWithScope(services, scope);
    return { service: Context.get(context, CaptionExtraction), ffmpegPath, filePath, calls };
  })
).pipe(Layer.provide(NodeServices.layer));
testLayer(fixtureLayer)("native caption extraction", (it) => {
  it.effect("orders preferred streams and skips failed or blank tracks", () =>
    Effect.gen(function* () {
      const fixture = yield* CaptionFixture;
      const tracks = yield* fixture.service.extract({
        ffmpegPath: fixture.ffmpegPath,
        filePath: fixture.filePath,
        preferredLanguages: ["en", "zh"],
      });
      expect(tracks).toEqual([{ language: "en", text: "English\n", title: undefined }]);
      expect(fixture.calls).toHaveLength(5);
      expect(fixture.service.probePath("/fixture/FFMPEG.EXE")).toBe("/fixture/ffprobe");
    })
  );
});
testLayer(probeReaderLayer)("native caption probe boundary", (it) => {
  it.effect("rejects unusable stream structures outside the probe parse catch", () =>
    Effect.gen(function* () {
      const reader = yield* CaptionProbeReader;
      const document = yield* reader.parse('{"streams":false}');
      const result = yield* document.filter(() => true).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    })
  );
});
