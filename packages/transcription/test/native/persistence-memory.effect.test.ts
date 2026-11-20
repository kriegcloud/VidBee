import { expect, layer } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { memoryLayer } from "../../src/memory-store.js";
import { layer as partialsLayer } from "../../src/Partials.layer.js";
import { Partials, PartialsManifest } from "../../src/Partials.service.js";
import { TranscriptionIds } from "../../src/TranscriptionIds.service.js";
import { TranscriptionTime } from "../../src/TranscriptionTime.service.js";
import { TranscriptStore } from "../../src/TranscriptStore.service.js";
import type { PipelineResult } from "../../src/Pipeline.model.js";
import type { HostFailure } from "../../src/Transcription.errors.js";

const primitives = Layer.mergeAll(
  Layer.sync(TranscriptionTime, () => {
    let now = 0;
    return {
      now: Effect.sync(() => ++now),
      monotonicMillis: Effect.succeed(0),
      readMonotonicMillis: () => 0,
      sleep: Effect.fn("fixture.sleep")(() => Effect.void),
      after: Effect.fn("fixture.after")(() => Effect.succeed(Effect.void)),
      every: Effect.fn("fixture.every")(() => Effect.succeed(Effect.void)),
      microtask: Effect.fn("fixture.microtask")((action: Effect.Effect<void, HostFailure>) => action),
    };
  }),
  Layer.sync(TranscriptionIds, () => {
    let id = 0;
    return { uuid: Effect.sync(() => `id-${++id}`), hex: Effect.fn("fixture.hex")(() => Effect.succeed("00")) };
  }),
  Layer.succeed(PartialsManifest, {
    load: Effect.fn("fixture.loadPartials")((workDir: string) =>
      Effect.succeed(
        workDir === "restored"
          ? {
              chunks: [{ index: 0, startMs: 10, endMs: 20, text: "restored", confidence: null, speakerKey: null }],
              stages: [{ stage: "recognizing", startedAt: 10 }],
            }
          : { chunks: [], stages: [] }
      )
    ),
  })
);
const services = Layer.mergeAll(memoryLayer, partialsLayer).pipe(Layer.provide(primitives));
const result = (): PipelineResult => ({
  resultKind: "transcript",
  modelVersion: "fixture",
  asrTier: null,
  language: "en",
  sourceKind: "captions",
  speakers: [],
  segments: [
    {
      startMs: 0,
      endMs: 100,
      text: "word",
      words: [{ startMs: 0, endMs: 100, text: "word" }],
      confidence: null,
      speakerKey: null,
    },
  ],
});
layer(services, { buildPerTest: true })("persistence memory and partials", (it) => {
  it.effect("keeps memory live records and word aliases; idempotence precedes clock", () =>
    Effect.gen(function* () {
      const store = yield* TranscriptStore;
      const original = result();
      const input = {
        downloadTaskId: "d",
        transcriptionTaskId: "t",
        transcriptId: "one",
        sourceFilePath: null,
        result: original,
      };
      const one = yield* store.commit(input);
      expect(one.segments[0]?.words).toBe(original.segments[0]?.words);
      const fetched = yield* store.getById("one");
      expect(fetched).toBe(one);
      const repeated = yield* store.commit(input);
      expect(repeated).toBe(one);
      const two = yield* store.commit({ ...input, transcriptId: "two", transcriptionTaskId: "t2", activate: false });
      expect(two.createdAt).toBe(2);
      const error = yield* store.appendCaptionCues("missing", []).pipe(Effect.flip);
      expect(error._tag).toBe("TranscriptUnavailable");
    })
  );
  it.effect("keeps first insertion order on timestamp ties and external mutation visible", () =>
    Effect.gen(function* () {
      const store = yield* TranscriptStore;
      const one = yield* store.commit({
        downloadTaskId: "d",
        transcriptionTaskId: "t",
        transcriptId: "one",
        sourceFilePath: null,
        result: result(),
      });
      one.language = "external";
      const latest = yield* store.getLatestForDownload("d");
      expect(latest?.language).toBe("external");
      const unchanged = yield* store.deleteSegments("one", ["absent"]);
      expect(unchanged).toBe(one);
      const inserted = yield* store.insertSegment("one", { atMs: 200, text: "new" });
      expect(inserted?.record).toBe(one);
      const deleted = yield* store.deleteSegments(
        "one",
        A.map(one.segments, (segment) => segment.id)
      );
      expect(deleted?.resultKind).toBe("transcript");
    })
  );
  it.effect("does not advance partial stage history for repeats or backward stages", () =>
    Effect.gen(function* () {
      const partials = yield* Partials;
      const first = yield* partials.setStage("t", "d", "recognizing");
      const repeated = yield* partials.setStage("t", "d", "recognizing");
      expect(repeated.stageHistory).toBe(first.stageHistory);
      const backward = yield* partials.setStage("t", "d", "preparing-audio");
      expect(backward.stageHistory).toBe(first.stageHistory);
      const next = yield* partials.setStage("t", "d", "diarizing");
      expect(next.stageHistory[1]?.startedAt).toBe(2);
      yield* partials.set("other", "d", []);
      yield* partials.clear("t");
      const selected = yield* partials.getByDownload("d");
      expect(selected?.taskId).toBe("other");
      yield* partials.clearByDownload("d");
      const missing = yield* partials.getByTask("other");
      expect(missing).toBe(null);
    })
  );
  it.effect("restores manifest segments and stage history through the supplied checkpoint capability", () =>
    Effect.gen(function* () {
      const partials = yield* Partials;
      const restored = yield* partials.restoreFromManifest({
        taskId: "restored-task",
        downloadTaskId: "restored-download",
        workDir: "restored",
      });
      expect(restored?.stage).toBe("recognizing");
      expect(restored?.segments[0]?.text).toBe("restored");
      const current = yield* partials.getByDownload("restored-download");
      expect(current).toBe(restored);
    })
  );
});
