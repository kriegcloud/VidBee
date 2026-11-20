import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import { AtomicFiles } from "../../src/AtomicFiles.service.js";
import { CaptionFilesLive } from "../../src/CaptionFiles.layer.js";
import { CaptionFiles } from "../../src/CaptionFiles.service.js";
import { CheckpointsLive } from "../../src/Checkpoints.layer.js";
import { PartialsManifest } from "../../src/Partials.service.js";
import { PartialsManifestLive } from "../../src/PartialsManifest.layer.js";
import { SeedFilesLive } from "../../src/SeedFiles.layer.js";
import { SeedFiles } from "../../src/SeedFiles.service.js";
import { HostFailure } from "../../src/Transcription.errors.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionFiles } from "../../src/TranscriptionFiles.service.js";
import { WorkerProtocolLive, WorkerResultJsonLive } from "../../src/WorkerProtocol.layer.js";
import { WorkerProtocol } from "../../src/WorkerProtocol.service.js";

const json = S.fromJsonString(S.Unknown);
const host = TranscriptionFilesLive.pipe(Layer.provideMerge(NodeFileSystem.layer));
const atomic = Layer.effect(
  AtomicFiles,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    return AtomicFiles.of({
      stagingPath: Effect.fn("test.stage")((path) => Effect.succeed(path)),
      publish: files.rename,
      write: files.write,
      writeJson: Effect.fn("test.json")(function* (path, value) {
        const text = yield* S.encodeUnknownEffect(json)(value).pipe(
          Effect.mapError((cause) => HostFailure.make({ operation: "test-json", cause, legacyMessage: String(cause) }))
        );
        yield* files.write(path, text);
      }),
    });
  })
).pipe(Layer.provide(host));
const boundaryServices = Layer.mergeAll(
  WorkerProtocolLive.pipe(Layer.provide(WorkerResultJsonLive)),
  SeedFilesLive,
  CheckpointsLive,
  CaptionFilesLive
).pipe(Layer.provideMerge(Layer.mergeAll(host, atomic, NodePath.layer)));
const services = PartialsManifestLive.pipe(Layer.provideMerge(boundaryServices));
const result = {
  resultKind: "transcript",
  language: null,
  modelVersion: "fixture",
  asrTier: null,
  speakers: [],
  segments: [],
};
layer(services)((it) => {
  it.effect("selects truthy inline data before paths and decodes known wire kinds", () =>
    Effect.gen(function* () {
      const protocol = yield* WorkerProtocol;
      const inline = yield* protocol.readResult({ result, resultPath: "absent" }, "/tmp");
      expect(inline).toBe(result);
      const future = yield* protocol.parse('  {"type":"future-kind"}  ');
      expect(future).toBeNull();
      const invalid = yield* protocol.parse("not-json");
      expect(invalid).toBeNull();
      const scalar = yield* protocol.parseLine("7");
      expect(scalar).toBe(7);
      const bad = yield* protocol.parse('{"type":"progress","stage":"recognizing","percent":"7"}').pipe(Effect.result);
      expect(Result.isFailure(bad)).toBe(true);
    })
  );
  it.effect("falls back from false inline values and rejects malformed file results", () =>
    Effect.gen(function* () {
      const files = yield* TranscriptionFiles;
      const fs = yield* FileSystem.FileSystem;
      const protocol = yield* WorkerProtocol;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-worker-boundary-" });
      const encoded = yield* S.encodeUnknownEffect(json)(result);
      yield* files.write(`${dir}/pipeline-result.json`, encoded);
      const decoded = yield* protocol.readResult({ result: false, resultPath: "" }, dir);
      expect(decoded).toEqual(result);
      yield* files.write(`${dir}/pipeline-result.json`, '{"resultKind":"future"}');
      const bad = yield* protocol.readResult({}, dir).pipe(Effect.result);
      expect(Result.isFailure(bad)).toBe(true);
    })
  );
  it.effect("retains nested seed metadata while rejecting consumed nonfinite fields", () =>
    Effect.gen(function* () {
      const files = yield* TranscriptionFiles;
      const fs = yield* FileSystem.FileSystem;
      const seeds = yield* SeedFiles;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-seed-boundary-" });
      const target = `${dir}/seed.json`;
      const segment = {
        speakerKey: null,
        startMs: 0,
        endMs: 3,
        text: "fixture",
        confidence: null,
        extra: "retained",
        words: [{ text: "fixture", startMs: 0, endMs: 3, extra: true }],
      };
      const encoded = yield* S.encodeUnknownEffect(json)({ segments: [segment], extra: "projected", speakers: [] });
      yield* files.write(target, encoded);
      const seed = yield* seeds.load(target);
      expect(seed?.segments[0]).toEqual(segment);
      expect(seed?.modelVersion).toBe("");
      yield* files.write(
        target,
        '{"segments":[{"speakerKey":null,"startMs":1e999,"endMs":3,"text":"fixture","confidence":null}]}'
      );
      const bad = yield* seeds.load(target).pipe(Effect.result);
      expect(Result.isFailure(bad)).toBe(true);
      yield* files.write(target, "not-json");
      const invalid = yield* seeds.load(target);
      expect(invalid).toBeNull();
    })
  );
  it.effect("sidecar scanning ignores directory tags and pick retains selected object identity", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const files = yield* TranscriptionFiles;
      const captions = yield* CaptionFiles;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-live_chat-" });
      const source = `${dir}/media.mp4`;
      yield* files.write(source, "fixture");
      yield* files.write(`${dir}/media.en.srt`, "fixture captions");
      yield* files.write(`${dir}/media.live_chat.srt`, "ignored chat");
      yield* files.write(`${dir}/media.fr.vtt`, "  ");
      const tracks = yield* captions.findSidecar(source);
      expect(tracks.length).toBe(1);
      expect(tracks[0]?.language).toBe("en");
      const chosen = yield* captions.pick(tracks, ["en"]);
      expect(chosen).toBe(tracks[0]);
    })
  );
  it.effect("stage files filter invalid elements, retain extra metadata and override embedded history", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const files = yield* TranscriptionFiles;
      const manifest = yield* PartialsManifest;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-stage-boundary-" });
      yield* files.write(
        `${dir}/chunks.json`,
        '{"key":{"taskId":"t","fingerprint":"f","modelVersion":"v"},"chunks":[],"stages":[{"stage":"embedded","startedAt":1}]}'
      );
      yield* files.write(
        `${dir}/stages.json`,
        '[null,7,{"stage":"recognizing","startedAt":1e999},{"stage":"committing","startedAt":2,"extra":true}]'
      );
      const loaded = yield* manifest.load(dir);
      expect(loaded).toEqual({ chunks: [], stages: [{ stage: "committing", startedAt: 2, extra: true }] });
    })
  );
});
