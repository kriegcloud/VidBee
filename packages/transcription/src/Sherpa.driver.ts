import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import { escapeJsonStringControlChars, isJsonControlCharError } from "./asr-json.js";
import { NativeAsrResult, NativeTurn, NativeTurnsHandle, NativeVadConfig, NativeVadFront } from "./Sherpa.model.js";
import { Sherpa, SherpaLoader } from "./Sherpa.service.js";
import { BoundaryDecodeError, HostFailure, ModelUnavailable } from "./Transcription.errors.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { FloatSamples } from "./WaveSamples.model.js";
import type { Addon, OfflineStream, Recognizer } from "sherpa-onnx-node";
import type { SherpaOperations } from "./Sherpa.service.js";
import type { TranscriptionError } from "./Transcription.errors.js";

const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) });
const invalid = (operation: string) =>
  BoundaryDecodeError.make({ operation, legacyMessage: `Invalid transcription data at ${operation}.` });
const attempt = <A>(operation: string, action: () => A) => Effect.try({ try: action, catch: failure(operation) });
const resultJson = S.fromJsonString(NativeAsrResult);
export const SherpaNativeLoader = Layer.sync(SherpaLoader, () => {
  let addon: import("sherpa-onnx-node").Addon | undefined;
  let readRaw: ((handle: unknown) => unknown) | undefined;
  const load = Effect.gen(function* () {
    if (addon !== undefined) return addon;
    const module = yield* Effect.tryPromise({
      try: () => import("sherpa-onnx-node"),
      catch: (cause) =>
        ModelUnavailable.make({
          operation: "loadAddon",
          cause,
          legacyMessage: `sherpa-onnx-node native addon is not available: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const raw = yield* Effect.tryPromise({
      try: () => import("sherpa-onnx-node/addon.js"),
      catch: failure("loadRawAddon"),
    });
    addon = module.default;
    readRaw = raw.default.getOfflineStreamResultAsJson;
    return addon;
  });
  return SherpaLoader.of({
    load,
    readResult: (_recognizer, stream) => {
      if (readRaw === undefined) throw invalid("native-asr-reader");
      const text = S.decodeUnknownResult(S.String)(readRaw(stream.handle));
      if (Result.isFailure(text)) throw invalid("native-asr");
      const first = S.decodeResult(resultJson)(text.success);
      if (Result.isSuccess(first)) return first.success;
      if (!isJsonControlCharError(new Error(first.failure.message))) throw invalid("native-asr");
      const repaired = S.decodeResult(resultJson)(escapeJsonStringControlChars(text.success));
      if (Result.isFailure(repaired)) throw invalid("native-asr");
      return repaired.success;
    },
  });
});
const makeOperations = (
  load: Effect.Effect<Addon, TranscriptionError>,
  readResult: (recognizer: Recognizer, stream: OfflineStream) => unknown,
  time: typeof TranscriptionTime.Service
): SherpaOperations => ({
  embeddingAvailable: load.pipe(Effect.map((addon) => Boolean(addon.SpeakerEmbeddingExtractor))),
  punctuationAvailable: load.pipe(Effect.map((addon) => Boolean(addon.OfflinePunctuation))),
  recognizer: Effect.fn("Sherpa.recognizer")(function* (config) {
    const addon = yield* load;
    const recognizer = yield* attempt("recognizer", () => new addon.OfflineRecognizer(config));
    const read = (stream: ReturnType<typeof recognizer.createStream>) => {
      const decoded = S.decodeUnknownResult(NativeAsrResult)(readResult(recognizer, stream));
      if (Result.isFailure(decoded)) throw invalid("native-asr");
      return decoded.success;
    };
    return {
      decode: Effect.fn("Sherpa.decode")((wave) =>
        attempt("decode", () => {
          const stream = recognizer.createStream();
          stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
          recognizer.decode(stream);
          return read(stream);
        }).pipe(Effect.mapError((error) => (S.is(BoundaryDecodeError)(error.cause) ? error.cause : error)))
      ),
      probe: Effect.fn("Sherpa.probe")((samples) =>
        attempt("probe", () => {
          const stream = recognizer.createStream();
          stream.acceptWaveform({ sampleRate: 16000, samples });
          stream.inputFinished?.();
          const start = time.readMonotonicMillis();
          recognizer.decode(stream);
          const end = time.readMonotonicMillis();
          read(stream);
          return end - start;
        }).pipe(Effect.mapError((error) => (S.is(BoundaryDecodeError)(error.cause) ? error.cause : error)))
      ),
    };
  }),
  vad: Effect.fn("Sherpa.vad")(function* (config, bufferSeconds, sampleRate) {
    const addon = yield* load;
    const vad = yield* attempt("vad", () => new addon.Vad(config, bufferSeconds));
    const observed = S.decodeUnknownOption(NativeVadConfig)(vad.config);
    const windowSize = Option.isSome(observed) ? (observed.value.sileroVad?.windowSize ?? 512) : 512;
    const take = Effect.fn("Sherpa.vad.take")(function* () {
      const intervals: Array<{ startMs: number; endMs: number }> = [];
      while (!(yield* attempt("vad.isEmpty", () => vad.isEmpty()))) {
        const raw = yield* attempt("vad.front", () => vad.front(false));
        const front = yield* S.decodeUnknownEffect(NativeVadFront)(raw).pipe(
          Effect.mapError(() => invalid("native-vad"))
        );
        const start = front.start ?? 0;
        const length = front.samples?.length ?? 0;
        intervals.push({
          startMs: Math.round((start / sampleRate) * 1000),
          endMs: Math.round(((start + length) / sampleRate) * 1000),
        });
        yield* attempt("vad.pop", () => vad.pop());
      }
      return intervals;
    });
    return {
      windowSize,
      accept: Effect.fn("Sherpa.vad.accept")((samples) =>
        attempt("vad.accept", () => vad.acceptWaveform(samples)).pipe(Effect.andThen(take()))
      ),
      flush: attempt("vad.flush", () => vad.flush()).pipe(Effect.andThen(take())),
    };
  }),
  diarizer: Effect.fn("Sherpa.diarizer")(function* (config) {
    const addon = yield* load;
    const diarizer = yield* attempt("diarizer", () => new addon.OfflineSpeakerDiarization(config));
    return {
      process: Effect.fn("Sherpa.diarizer.process")(function* (samples) {
        const raw = yield* attempt("diarizer.process", () => diarizer.process(samples));
        let values: unknown[] = [];
        if (Arr.isArray(raw)) values = raw;
        else {
          const handle = S.decodeUnknownOption(NativeTurnsHandle)(raw);
          if (Option.isSome(handle) && handle.value.size !== undefined && handle.value.get !== undefined) {
            for (let index = 0; index < handle.value.size; index++) {
              const getter = handle.value.get;
              const turn = yield* attempt("diarizer.get", () => getter?.call(raw, index));
              values.push(turn);
            }
          }
        }
        return yield* S.decodeUnknownEffect(S.Array(NativeTurn))(values).pipe(
          Effect.mapError(() => invalid("native-diarization"))
        );
      }),
    };
  }),
  embedding: Effect.fn("Sherpa.embedding")(function* (config) {
    const addon = yield* load;
    const Constructor = addon.SpeakerEmbeddingExtractor;
    if (Constructor === undefined || !P.isTruthy(Constructor)) return null;
    const extractor = yield* attempt("embedding", () => new Constructor(config));
    return {
      compute: Effect.fn("Sherpa.embedding.compute")(function* (wave) {
        const raw = yield* attempt("embedding.compute", () => {
          const stream = extractor.createStream();
          stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
          stream.inputFinished?.();
          if (extractor.isReady !== undefined && !extractor.isReady(stream)) return null;
          return extractor.compute(stream, false);
        });
        if (!P.isTruthy(raw)) return null;
        const vector = yield* S.decodeUnknownEffect(FloatSamples)(raw).pipe(
          Effect.mapError(() => invalid("native-embedding"))
        );
        return vector.length === 0 ? null : vector;
      }),
    };
  }),
  punctuator: Effect.fn("Sherpa.punctuator")(function* (config) {
    const addon = yield* load;
    const Constructor = addon.OfflinePunctuation;
    if (Constructor === undefined || !P.isTruthy(Constructor)) return null;
    const punctuation = yield* attempt("punctuation", () => new Constructor(config));
    return {
      addPunct: (text: string) => {
        const value = S.decodeUnknownResult(S.String)(punctuation.addPunct(text));
        if (Result.isFailure(value)) throw invalid("native-punctuation");
        return value.success;
      },
    };
  }),
});
export const SherpaLive = Layer.effect(
  Sherpa,
  Effect.gen(function* () {
    const loader = yield* SherpaLoader;
    const time = yield* TranscriptionTime;
    const operations = makeOperations(loader.load, loader.readResult, time);
    return Sherpa.of({
      ...operations,
      session: loader.load.pipe(Effect.map((addon) => makeOperations(Effect.succeed(addon), loader.readResult, time))),
    });
  })
);
