import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { Audio } from "../../src/Audio.service.js";
import { Checkpoints } from "../../src/Checkpoints.service.js";
import { Models } from "../../src/Models.service.js";
import { Pipeline } from "../../src/Pipeline.service.js";
import { makeLayer as fakeLayer } from "../../src/pipeline-fake.js";
import { Sherpa } from "../../src/Sherpa.service.js";
import { makeLayer as sherpaLayer } from "../../src/SherpaPipeline.layer.js";
import { HostFailure } from "../../src/Transcription.errors.js";
import { TranscriptionTimeLive } from "../../src/TranscriptionTime.layer.js";
import type { ModelRole } from "../../src/Literal.model.js";
import type { PipelineProgress, PipelineSegment } from "../../src/Pipeline.model.js";
import type { SherpaOperations } from "../../src/Sherpa.service.js";

const input = {
  sourceFilePath: "/source",
  wavPath: "/wave",
  durationMs: 3000,
  skipVad: true,
  autoSkipAllowed: false,
  speakerCount: 1 as const,
  asrTier: "minimal" as const,
};
class Calls extends Context.Service<Calls, { readonly calls: string[] }>()(
  "@vidbee/transcription/test/native/pipeline.effect.test/Calls"
) {}
const state = Layer.sync(Calls, () => ({ calls: [] }));
const unused = Effect.fn("fixture.unused")(() => Effect.die("unused fixture operation"));
const status = { ready: true, version: "fixture", bytes: 0, files: [], tiers: [], downloading: null, downloads: [] };
const models = Layer.effect(
  Models,
  Effect.gen(function* () {
    const state = yield* Calls;
    return Models.of({
      modelsDir: "/models",
      status: Effect.fn("fixture.status")(() => Effect.succeed(status)),
      pathFor: unused,
      pathByRole: Effect.fn("fixture.pathByRole")((role: ModelRole) =>
        Effect.sync(() => {
          state.calls.push(`path:${role}`);
          return `/models/${role}`;
        })
      ),
      pathById: unused,
      incompleteModelIssue: Effect.fn("fixture.issue")(() => Effect.succeed(null)),
      ensureReady: Effect.fn("fixture.ready")((options) =>
        Effect.sync(() => {
          state.calls.push(`ready:${options?.groups?.[0] ?? "all"}`);
          return status;
        })
      ),
      ensureReadyAllowCancel: unused,
      redownload: Effect.die("unused redownload"),
      removeTier: unused,
      cancelDownload: unused,
      subscribe: unused,
    });
  })
);
const audio = Layer.effect(
  Audio,
  Effect.gen(function* () {
    const state = yield* Calls;
    return Audio.of({
      extract: unused,
      readPcm: Effect.fn("fixture.readPcm")(() =>
        Effect.sync(() => {
          state.calls.push("audio");
          return { sampleRate: 1000, samples: new Float32Array(3000) };
        })
      ),
    });
  })
);
const checkpoints = Layer.succeed(Checkpoints, {
  sourceFingerprint: unused,
  manifestPath: (path) => path,
  stagesPath: (path) => path,
  load: unused,
  save: unused,
  ensure: unused,
  patch: unused,
  append: unused,
  loadStages: unused,
  saveStages: unused,
  chunks: unused,
  turns: unused,
  speakers: unused,
});
const sherpa = Layer.effect(
  Sherpa,
  Effect.gen(function* () {
    const state = yield* Calls;
    const operations: SherpaOperations = {
      embeddingAvailable: Effect.succeed(false),
      punctuationAvailable: Effect.succeed(true),
      recognizer: Effect.fn("fixture.recognizer")((config: Record<string, unknown>) =>
        Effect.sync(() => {
          state.calls.push(`recognizer:${config.modelConfig === undefined ? "missing" : "configured"}`);
          return {
            decode: Effect.fn("fixture.decode")(() =>
              Effect.sync(() => {
                state.calls.push("decode");
                return {
                  text: "hello world",
                  tokens: ["hello", "▁world"],
                  timestamps: [0, 0.5],
                  durations: [0.4, 0.5],
                };
              })
            ),
            probe: unused,
          };
        })
      ),
      vad: Effect.fn("fixture.vad")(() =>
        Effect.sync(() => {
          state.calls.push("vad");
          return {
            windowSize: 1000,
            accept: Effect.fn("fixture.vad.accept")(() => Effect.succeed([])),
            flush: Effect.succeed([]),
          };
        })
      ),
      diarizer: unused,
      embedding: unused,
      punctuator: Effect.fn("fixture.punctuation")(() =>
        Effect.succeed({
          addPunct: (text: string) => {
            state.calls.push(`punctuate:${text}`);
            return "hello, world.";
          },
        })
      ),
    };
    return Sherpa.of({
      ...operations,
      session: Effect.sync(() => {
        state.calls.push("session");
        return operations;
      }),
    });
  })
);
const dependencies = Layer.mergeAll(models, audio, checkpoints, sherpa, LegacyTiming.layer).pipe(
  Layer.provideMerge(state)
);
const services = sherpaLayer().pipe(Layer.provideMerge(dependencies));
const emptySink = {
  progress: Effect.fn("fixture.progress")(() => Effect.void),
  partial: Effect.fn("fixture.partial")(() => Effect.void),
  log: Effect.fn("fixture.log")(() => Effect.void),
};
layer(services)("native Sherpa pipeline", (it) => {
  it.effect("recognizes words and punctuation through explicit native capabilities", () =>
    Effect.gen(function* () {
      const pipeline = yield* Pipeline;
      const state = yield* Calls;
      state.calls.length = 0;
      const stages: PipelineProgress[] = [];
      const partials: PipelineSegment[] = [];
      const result = yield* pipeline.run(input, {
        ...emptySink,
        progress: Effect.fn("fixture.captureProgress")((progress: PipelineProgress) =>
          Effect.sync(() => {
            stages.push(progress);
          })
        ),
        partial: Effect.fn("fixture.capturePartial")((segment: PipelineSegment) =>
          Effect.sync(() => {
            partials.push(segment);
          })
        ),
      });
      expect(result.resultKind).toBe("transcript");
      expect(result.segments[0]?.text).toBe("hello, world.");
      expect(result.segments[0]?.words?.length).toBe(2);
      expect(result.speakers).toEqual([{ speakerKey: "speaker-1", displayName: "Speaker 1" }]);
      expect(partials).toHaveLength(1);
      expect(stages[0]?.stage).toBe("preparing-models");
      expect(stages.at(-1)?.stage).toBe("committing");
      expect(state.calls).toContain("ready:asr");
      expect(state.calls).toContain("decode");
      expect(state.calls).toContain("punctuate:hello world");
    })
  );
  it.effect("short circuits silence after VAD without acquiring a recognizer", () =>
    Effect.gen(function* () {
      const pipeline = yield* Pipeline;
      const state = yield* Calls;
      state.calls.length = 0;
      const result = yield* pipeline.run({ ...input, skipVad: false, autoSkipAllowed: true }, emptySink);
      expect(result.resultKind).toBe("no-speech");
      expect(state.calls).toContain("ready:vad");
      expect(state.calls).toContain("vad");
      expect(state.calls).not.toContain("decode");
    })
  );
  it.effect("single speaker seed bypasses model, addon and audio work", () =>
    Effect.gen(function* () {
      const pipeline = yield* Pipeline;
      const state = yield* Calls;
      state.calls.length = 0;
      const result = yield* pipeline.run(
        {
          ...input,
          existingTranscript: {
            language: "en",
            modelVersion: "seed",
            asrTier: null,
            sourceKind: "asr",
            speakers: [],
            segments: [{ speakerKey: null, startMs: 0, endMs: 3000, text: "saved words", confidence: null }],
          },
        },
        emptySink
      );
      expect(state.calls).toEqual([]);
      expect(result.segments[0]?.speakerKey).toBe("speaker-1");
      expect(result.modelVersion).toBe("seed");
    })
  );
});
layer(fakeLayer({ speech: true }).pipe(Layer.provide(TranscriptionTimeLive)))("native fake pipeline", (it) => {
  it.effect("retains callback failures and stops before partial delivery", () =>
    Effect.gen(function* () {
      const pipeline = yield* Pipeline;
      const cause = new Error("callback fixture");
      let count = 0;
      const result = yield* pipeline
        .run(input, {
          ...emptySink,
          progress: Effect.fn("fixture.failedProgress")(() =>
            HostFailure.make({ operation: "progress", legacyMessage: cause.message, cause })
          ),
          partial: Effect.fn("fixture.countPartial")(() =>
            Effect.sync(() => {
              count++;
            })
          ),
        })
        .pipe(Effect.result);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure).toMatchObject({ cause });
      expect(count).toBe(0);
    })
  );
  it.effect("emits partials before final diarization and committing stages", () =>
    Effect.gen(function* () {
      const pipeline = yield* Pipeline;
      const events: string[] = [];
      yield* pipeline.run(input, {
        ...emptySink,
        progress: Effect.fn("fixture.orderedProgress")((progress: PipelineProgress) =>
          Effect.sync(() => {
            events.push(progress.stage);
          })
        ),
        partial: Effect.fn("fixture.orderedPartial")(() =>
          Effect.sync(() => {
            events.push("partial");
          })
        ),
      });
      expect(events).toEqual(["detecting-speech", "recognizing", "partial", "partial", "diarizing", "committing"]);
    })
  );
});
