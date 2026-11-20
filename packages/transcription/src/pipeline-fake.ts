import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as P from "effect/Predicate";
import { applyChineseScriptToResult, chineseScriptOf } from "./chinese-script.js";
import { modelVersion } from "./model-catalog.js";
import { Pipeline } from "./Pipeline.service.js";
import type { FakePipelineOptions } from "./PipelineInput.model.js";

export type { FakePipelineOptions } from "./PipelineInput.model.js";

import { assignSpeakersToSegments, singleSpeakerTurns } from "./speaker-assign.js";
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount } from "./speaker-count.js";
import { WorkerFailure } from "./Transcription.errors.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import type { PipelineResult } from "./Pipeline.model.js";

const spokenResult = (): PipelineResult => ({
  resultKind: "transcript",
  language: "en",
  modelVersion,
  asrTier: "minimal",
  speakers: [
    {
      speakerKey: "speaker-1",
      displayName: "Speaker 1",
    },
    {
      speakerKey: "speaker-2",
      displayName: "Speaker 2",
    },
  ],
  segments: [
    {
      speakerKey: "speaker-1",
      startMs: 0,
      endMs: 1800,
      text: "Hello, this is a fixture transcript.",
      words: [
        {
          text: "Hello,",
          startMs: 0,
          endMs: 400,
        },
        {
          text: " this",
          startMs: 400,
          endMs: 700,
        },
        {
          text: " is",
          startMs: 700,
          endMs: 900,
        },
        {
          text: " a",
          startMs: 900,
          endMs: 1050,
        },
        {
          text: " fixture",
          startMs: 1050,
          endMs: 1400,
        },
        {
          text: " transcript.",
          startMs: 1400,
          endMs: 1800,
        },
      ],
      confidence: 0.9,
    },
    {
      speakerKey: "speaker-2",
      startMs: 1900,
      endMs: 3600,
      text: "And this is the second speaker.",
      words: [
        {
          text: "And",
          startMs: 1900,
          endMs: 2100,
        },
        {
          text: " this",
          startMs: 2100,
          endMs: 2300,
        },
        {
          text: " is",
          startMs: 2300,
          endMs: 2450,
        },
        {
          text: " the",
          startMs: 2450,
          endMs: 2600,
        },
        {
          text: " second",
          startMs: 2600,
          endMs: 3000,
        },
        {
          text: " speaker.",
          startMs: 3000,
          endMs: 3600,
        },
      ],
      confidence: 0.88,
    },
  ],
});
const silentResult = (): PipelineResult => ({
  resultKind: "no-speech",
  language: null,
  modelVersion,
  asrTier: "minimal",
  speakers: [],
  segments: [],
});
export const makeLayer = (options: FakePipelineOptions = {}) =>
  Layer.effect(
    Pipeline,
    Effect.gen(function* () {
      const time = yield* TranscriptionTime;
      return Pipeline.of({
        run: Effect.fn("FakePipeline.run")(function* (input, sink) {
          const cancelled = () =>
            WorkerFailure.make({
              operation: "pipeline",
              legacyMessage: "cancelled",
            });
          if (P.isTruthy(input.signal?.aborted)) return yield* cancelled();
          yield* sink.progress({
            stage: "detecting-speech",
            percent: 0.2,
            message: undefined,
          });
          if (P.isTruthy(options.delayMs) && options.delayMs !== undefined) yield* time.sleep(options.delayMs);
          if (P.isTruthy(input.signal?.aborted)) return yield* cancelled();
          if (P.isTruthy(options.result) && options.result !== undefined) {
            yield* sink.progress({
              stage: "committing",
              percent: 1,
              message: undefined,
            });
            return options.result;
          }
          const seed = input.existingTranscript;
          if (P.isTruthy(seed?.segments.length) && seed !== undefined) {
            yield* sink.progress({
              stage: "diarizing",
              percent: 0.5,
              message: undefined,
            });
            const count = parseSpeakerCount(input.speakerCount, DEFAULT_SPEAKER_COUNT);
            const endMs = Arr.reduce(seed.segments, 1, (maximum, segment) => Math.max(maximum, segment.endMs));
            const turns =
              count === 1
                ? singleSpeakerTurns(endMs)
                : [
                    {
                      startMs: 0,
                      endMs: Math.ceil(endMs / 2),
                      speakerKey: "speaker-1",
                    },
                    {
                      startMs: Math.ceil(endMs / 2),
                      endMs,
                      speakerKey: "speaker-2",
                    },
                  ];
            const assigned = assignSpeakersToSegments(seed.segments, turns);
            const converted = applyChineseScriptToResult(
              {
                resultKind: "transcript",
                language: seed.language,
                modelVersion: P.isTruthy(seed.modelVersion) ? seed.modelVersion : modelVersion,
                asrTier: seed.sourceKind === "captions" ? seed.asrTier : (seed.asrTier ?? input.asrTier ?? "minimal"),
                sourceKind: seed.sourceKind,
                speakers: assigned.speakers,
                segments: assigned.segments,
              },
              chineseScriptOf(input.language ?? "")
            );
            for (const segment of converted.segments) yield* sink.partial(segment);
            yield* sink.progress({
              stage: "committing",
              percent: 1,
              message: undefined,
            });
            return {
              ...converted,
              language: seed.language,
            };
          }
          const hasSpeech = options.speech ?? input.skipVad;
          if (!hasSpeech && input.autoSkipAllowed) {
            yield* sink.progress({
              stage: "committing",
              percent: 1,
              message: "no-speech",
            });
            return silentResult();
          }
          yield* sink.progress({
            stage: "recognizing",
            percent: 0.6,
            message: undefined,
          });
          const result = spokenResult();
          if (P.isTruthy(input.asrTier) && input.asrTier !== undefined) result.asrTier = input.asrTier;
          const converted = applyChineseScriptToResult(result, chineseScriptOf(input.language ?? ""));
          for (const segment of converted.segments) yield* sink.partial(segment);
          yield* sink.progress({
            stage: "diarizing",
            percent: 0.9,
            message: undefined,
          });
          yield* sink.progress({
            stage: "committing",
            percent: 1,
            message: undefined,
          });
          return converted;
        }),
      });
    })
  );
