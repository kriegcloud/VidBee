import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Audio } from "../../src/Audio.service.js";
import { makeLayer as makeFileLayer } from "../../src/CloudFileIO.layer.js";
import { layer as cloudLayer } from "../../src/CloudTranscription.layer.js";
import { CloudTranscription } from "../../src/CloudTranscription.service.js";
import { manifestWorkKey } from "../../src/chunk-manifest.js";
import { cloudClipWav } from "../../src/cloud-runner.js";
import { HostFailure } from "../../src/Transcription.errors.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionIds } from "../../src/TranscriptionIds.service.js";
import { binaryLayer } from "../../src/WaveReader.layer.js";
import type { CloudRunInput } from "../../src/CloudRun.model.js";
import type { CloudRunSink } from "../../src/CloudTranscription.service.js";

class CloudFixture extends Context.Service<
  CloudFixture,
  {
    readonly service: typeof CloudTranscription.Service;
    readonly input: CloudRunInput;
    readonly checkpoint: string;
    readonly fs: FileSystem.FileSystem;
  }
>()("@vidbee/transcription/test/native/cloud-transcription.effect.test/CloudFixture") {}
const fixture = Layer.effect(
  CloudFixture,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const wav = path.join(root, "audio.wav");
    yield* fs.writeFile(wav, cloudClipWav(new Uint8Array(3200)));
    const signal = yield* Effect.abortSignal;
    const input: CloudRunInput = {
      accountId: "account",
      taskId: "task",
      sourceFilePath: "source",
      ffmpegPath: "ffmpeg",
      workRoot: root,
      modelId: "model",
      signal,
    };
    const checkpoint = path.join(
      root,
      "vidbee-transcript",
      manifestWorkKey("task", "fingerprint", "cloud-v1:model"),
      "cloud.json"
    );
    const audio = Layer.succeed(Audio, {
      extract: Effect.fn("fixture.extract")(() => Effect.succeed({ wavPath: wav, durationMs: 100 })),
      readPcm: Effect.fn("fixture.readPcm")(() => Effect.die("unused")),
    });
    const ids = Layer.succeed(TranscriptionIds, {
      uuid: Effect.succeed("paid-id"),
      hex: Effect.fn("fixture.hex")(() => Effect.succeed("hex")),
    });
    const io = makeFileLayer(Effect.fn("fixture.fingerprint")(() => Effect.succeed("fingerprint"))).pipe(
      Layer.provide(TranscriptionFilesLive)
    );
    const services = cloudLayer.pipe(
      Layer.provide(io),
      Layer.provide(TranscriptionFilesLive),
      Layer.provide(ids),
      Layer.provide(audio),
      Layer.provide(binaryLayer)
    );
    const scope = yield* Effect.scope;
    const context = yield* Layer.buildWithScope(services, scope);
    return { service: Context.get(context, CloudTranscription), input, checkpoint, fs };
  })
).pipe(Layer.provide(NodeServices.layer));
layer(fixture)("native cloud paid checkpoint ownership", (it) => {
  it.effect(
    "persists identity before upload and result before partial, replays paid result, and leaves malformed replay untouched",
    () =>
      Effect.gen(function* () {
        const f = yield* CloudFixture;
        let calls = 0;
        let partials = 0;
        const hookFailure = HostFailure.make({ operation: "partial", legacyMessage: "partial hook failed" });
        const sink: CloudRunSink = {
          checkAbort: Effect.void,
          transcribe: Effect.fn("fixture.transcribe")(function* (_bytes, requestId) {
            calls++;
            expect(requestId).toBe("paid-id");
            const saved = yield* f.fs
              .readFileString(f.checkpoint)
              .pipe(
                Effect.mapError((cause) =>
                  HostFailure.make({ operation: "fixture-read", legacyMessage: cause.message, cause })
                )
              );
            expect(saved).toContain('"requestId":"paid-id"');
            expect(saved).not.toContain('"result"');
            return {
              requestId,
              modelId: "model",
              text: "paid words",
              language: "en",
              audioSeconds: 0.1,
              credits: 1,
              extra: "retained",
            };
          }),
          progress: Effect.fn("fixture.progress")(() => Effect.void),
          partial: Effect.fn("fixture.partial")(function* () {
            partials++;
            if (partials === 1) return yield* hookFailure;
          }),
          failureInfo: Effect.fn("fixture.failureInfo")(() =>
            Effect.succeed({ failedReservation: false, conflict: false })
          ),
        };
        const failed = yield* f.service.run(f.input, sink).pipe(Effect.result);
        expect(failed._tag).toBe("Failure");
        const persisted = yield* f.fs.readFileString(f.checkpoint);
        expect(persisted).toContain('"text":"paid words"');
        expect(persisted).toContain('"extra":"retained"');
        const replay = yield* f.service.run(f.input, sink);
        expect(calls).toBe(1);
        expect(replay.result.segments[0]?.text).toBe("paid words");
        const malformed =
          '{"accountId":"account","extra":7,"clips":[{"start":0,"end":1600,"requestId":"paid-id","result":true}]}';
        yield* f.fs.writeFileString(f.checkpoint, malformed);
        const rejected = yield* f.service.run(f.input, sink).pipe(Effect.result);
        expect(rejected._tag).toBe("Failure");
        if (rejected._tag === "Failure") expect(rejected.failure._tag).toBe("BoundaryDecodeError");
        const retained = yield* f.fs.readFileString(f.checkpoint);
        expect(retained).toBe(malformed);
        expect(calls).toBe(1);
        const reserved = '{"accountId":"account","clips":[{"start":0,"end":1600,"requestId":"paid-id"}]}';
        yield* f.fs.writeFileString(f.checkpoint, reserved);
        const invalidFresh = yield* f.service
          .run(f.input, {
            ...sink,
            transcribe: Effect.fn("fixture.invalidFresh")(() =>
              Effect.succeed({
                requestId: "paid-id",
                modelId: "model",
                text: "unsafe",
                language: "en",
                audioSeconds: Number.NaN,
                credits: 1,
              })
            ),
          })
          .pipe(Effect.result);
        expect(invalidFresh._tag).toBe("Failure");
        if (invalidFresh._tag === "Failure") expect(invalidFresh.failure._tag).toBe("BoundaryDecodeError");
        const retainedReservation = yield* f.fs.readFileString(f.checkpoint);
        expect(retainedReservation).toBe(reserved);
        yield* replay.cleanup;
        const exists = yield* f.fs.exists(f.checkpoint);
        expect(exists).toBe(false);
      })
  );
});
