import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import { Audio } from "./Audio.service.js";
import { buildOfflineRecognizerConfig } from "./asr-recognizer.js";
import { asrTierInfo, DEFAULT_ASR_TIER, parseAsrTier } from "./asr-tiers.js";
import { wordsFromAsrResult } from "./asr-words.js";
import { Checkpoints } from "./Checkpoints.service.js";
import { applyChineseScriptToSegment, chineseScriptOf, languageAfterChineseScript } from "./chinese-script.js";
import { chunkKey } from "./chunk-manifest.js";
import { Models } from "./Models.service.js";
import { modelVersion } from "./model-catalog.js";
import { Pipeline } from "./Pipeline.service.js";
import { DIARIZE_NUM_THREADS, MIN_DURATION_OFF_SEC, MIN_DURATION_ON_SEC, splitTurnForAsr } from "./pipeline-sherpa.js";
import { needsPunctuation, punctuateCues, punctuateWords } from "./punctuate.js";
import { Sherpa } from "./Sherpa.service.js";
import { assignSpeakersToSegments, seedDurationMs, singleSpeakerTurns } from "./speaker-assign.js";
import {
  DIARIZE_OVERLAP_MS,
  diarizeChunkWindows,
  mergeChunkTurns,
  mergeChunkTurnsByEmbeddings,
  pickSpeakerEmbedTurns,
  shiftTurns,
} from "./speaker-chunks.js";
import { CLUSTERING_THRESHOLD } from "./speaker-cluster.js";
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount, sherpaNumClusters } from "./speaker-count.js";
import {
  embeddingIdForLanguage,
  SPEAKER_EMBEDDING_ERES2NET_ID,
  SPEAKER_EMBEDDING_TITANET_ID,
} from "./speaker-embed.js";
import { fillUncoveredTurns, turnsForAsr } from "./speaker-refine.js";
import { ModelUnavailable, WorkerFailure } from "./Transcription.errors.js";
import type { ChineseScript } from "./Caption.model.js";
import type { ManifestChunk, ManifestEnvelope } from "./Checkpoint.model.js";
import type { AsrTierId } from "./Literal.model.js";
import type {
  PcmWave,
  PipelineSegment,
  PipelineSpeaker,
  SpeakerEmbed,
  TimedTurn,
  TimeInterval,
} from "./Pipeline.model.js";
import type { TranscriptionSink } from "./Pipeline.service.js";
import type { PipelineInput, SherpaPipelineOptions } from "./PipelineInput.model.js";
import type { Punctuator } from "./punctuate.js";
import type { PipelineSeed } from "./Seed.model.js";
import type { SherpaOperations } from "./Sherpa.service.js";

interface ManifestState {
  chunks: ManifestChunk[];
  raw: ManifestEnvelope;
  speakers: PipelineSpeaker[];
  turns: TimedTurn[];
}
const cancelled = () => WorkerFailure.make({ operation: "pipeline", legacyMessage: "cancelled" });
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
export const makeLayer = (options: SherpaPipelineOptions = {}) =>
  Layer.effect(
    Pipeline,
    Effect.gen(function* () {
      const models = yield* Models;
      const audio = yield* Audio;
      const checkpoints = yield* Checkpoints;
      const driver = yield* Sherpa;
      const timing = yield* LegacyTiming;
      const provider = () => options.provider ?? "cpu";
      const awaitAt = <A, E, R>(effect: Effect.Effect<A, E, R>, point: string) =>
        effect.pipe(Effect.onExit(() => timing.turn(point)));
      const loadManifest = Effect.fn("Pipeline.loadManifest")(function* (file: string) {
        const raw = yield* checkpoints.load(file);
        if (raw === null) return null;
        const speakers = yield* checkpoints.speakers(raw);
        const turns = yield* checkpoints.turns(raw);
        const chunks = yield* checkpoints.chunks(raw);
        return { raw, speakers, turns, chunks };
      });
      const refresh = Effect.fn("Pipeline.refreshManifest")(function* (state: ManifestState, raw: ManifestEnvelope) {
        state.raw = raw;
        state.turns = yield* checkpoints.turns(raw);
        state.chunks = yield* checkpoints.chunks(raw);
        state.speakers = yield* checkpoints.speakers(raw);
      });
      const paths = Effect.fn("Pipeline.paths")(function* (tier: AsrTierId) {
        const issue = yield* models.incompleteModelIssue(tier);
        if (P.isTruthy(issue) && issue !== null)
          return yield* ModelUnavailable.make({ operation: "recognizer", legacyMessage: issue });
        const decoder = yield* models.pathByRole("asr-decoder", tier);
        const encoder = yield* models.pathByRole("asr-encoder", tier);
        const frontend = yield* models.pathByRole("asr-frontend", tier);
        const joiner = yield* models.pathByRole("asr-joiner", tier);
        const model = yield* models.pathByRole("asr-model", tier);
        const tokenizer = yield* models.pathByRole("asr-tokenizer", tier);
        const tokens = yield* models.pathByRole("asr-tokens", tier);
        return { decoder, encoder, frontend, joiner, model, tokenizer, tokens };
      });
      const tryPunctuation = Effect.fn("Pipeline.tryPunctuation")(
        (sink: TranscriptionSink, session?: SherpaOperations) =>
          Effect.gen(function* () {
            const sherpa = session ?? (yield* driver.session);
            if (!(yield* sherpa.punctuationAvailable)) return null;
            let file = yield* models.pathByRole("punctuation");
            if (!P.isTruthy(file)) {
              yield* sink.progress({ stage: "preparing-models", percent: null, message: "punct" });
              const ready = yield* models.ensureReady({ groups: ["punct"] }).pipe(Effect.result);
              if (ready._tag === "Failure") return null;
              file = yield* models.pathByRole("punctuation");
            }
            if (!P.isTruthy(file)) return null;
            return yield* sherpa.punctuator({
              model: { ctTransformer: file, numThreads: 1, provider: "cpu", debug: 0 },
            });
          }).pipe(Effect.orElseSucceed(() => null))
      );
      const commitSeed = Effect.fn("Pipeline.commitSeed")(function* (
        _input: PipelineInput,
        sink: TranscriptionSink,
        seed: PipelineSeed,
        turns: TimedTurn[],
        tier: AsrTierId,
        session?: SherpaOperations
      ) {
        let segments = seed.segments;
        if (
          seed.sourceKind === "captions" &&
          needsPunctuation(
            Arr.join(
              Arr.map(segments, (segment) => segment.text),
              ""
            )
          )
        ) {
          const punctuation = yield* awaitAt(tryPunctuation(sink, session), "pipeline.seed.punctuation");
          if (punctuation !== null) segments = punctuateCues(punctuation, segments);
        }
        const assigned = assignSpeakersToSegments(segments, turns);
        for (const segment of assigned.segments) yield* sink.partial(segment);
        yield* sink.progress({ stage: "committing", percent: 1, message: undefined });
        return {
          resultKind: "transcript" as const,
          language: seed.language,
          modelVersion: P.isTruthy(seed.modelVersion) ? seed.modelVersion : modelVersion,
          asrTier: seed.sourceKind === "captions" ? seed.asrTier : tier,
          sourceKind: seed.sourceKind,
          speakers: assigned.speakers,
          segments: assigned.segments,
        };
      });
      const speechIntervals = Effect.fn("Pipeline.speechIntervals")(function* (
        sherpa: SherpaOperations,
        wave: PcmWave,
        input: PipelineInput
      ) {
        const file = yield* models.pathByRole("vad");
        if (!P.isTruthy(file))
          return yield* ModelUnavailable.make({ operation: "vad", legacyMessage: "model missing: silero vad" });
        const duration = wave.samples.length / Math.max(1, wave.sampleRate);
        const bufferSeconds = Math.min(600, Math.max(120, Math.ceil(duration) + 5));
        const vad = yield* sherpa.vad(
          {
            sileroVad: {
              model: file,
              threshold: 0.35,
              minSilenceDuration: 0.3,
              minSpeechDuration: 0.15,
              windowSize: 512,
              maxSpeechDuration: 20,
            },
            sampleRate: wave.sampleRate,
            numThreads: 1,
            provider: "cpu",
          },
          bufferSeconds,
          wave.sampleRate
        );
        const intervals: TimeInterval[] = [];
        for (let index = 0; index + vad.windowSize <= wave.samples.length; index += vad.windowSize) {
          if (P.isTruthy(input.signal?.aborted)) return yield* cancelled();
          const observed = yield* vad.accept(wave.samples.subarray(index, index + vad.windowSize));
          intervals.push(...observed);
        }
        const final = yield* vad.flush;
        intervals.push(...final);
        return intervals;
      });
      const diarize = Effect.fn("Pipeline.diarize")(function* (
        sherpa: SherpaOperations,
        wave: PcmWave,
        speech: TimeInterval[],
        totalMs: number,
        input: PipelineInput,
        sink: TranscriptionSink
      ) {
        const count = parseSpeakerCount(input.speakerCount, DEFAULT_SPEAKER_COUNT);
        if (count === 1) {
          const solo = Arr.map(speech.length > 0 ? speech : [{ startMs: 0, endMs: totalMs }], (interval) => ({
            ...interval,
            speakerKey: "speaker-1",
          }));
          return turnsForAsr(solo, speech, totalMs, { knownCount: true });
        }
        const segmentation = yield* models.pathByRole("segmentation");
        const embeddingId = embeddingIdForLanguage(input.language);
        let embedding = yield* models.pathById(embeddingId);
        embedding ??= yield* models.pathById(SPEAKER_EMBEDDING_TITANET_ID);
        embedding ??= yield* models.pathById(SPEAKER_EMBEDDING_ERES2NET_ID);
        embedding ??= yield* models.pathByRole("embedding");
        if (!P.isTruthy(segmentation) || !P.isTruthy(embedding))
          return yield* ModelUnavailable.make({
            operation: "diarization",
            legacyMessage: "model missing: speaker diarization",
          });
        const numClusters = sherpaNumClusters(count);
        const diarizer = yield* sherpa.diarizer({
          segmentation: {
            pyannote: { model: segmentation, windowShiftRatio: 0.1 },
            numThreads: DIARIZE_NUM_THREADS,
            provider: provider(),
          },
          embedding: { model: embedding, numThreads: DIARIZE_NUM_THREADS, provider: provider() },
          clustering: { numClusters, threshold: CLUSTERING_THRESHOLD },
          minDurationOn: MIN_DURATION_ON_SEC,
          minDurationOff: MIN_DURATION_OFF_SEC,
        });
        const windows = diarizeChunkWindows(totalMs);
        const extractor = (yield* sherpa.embeddingAvailable)
          ? yield* sherpa.embedding({ model: embedding, numThreads: DIARIZE_NUM_THREADS, provider: provider() })
          : null;
        const bridge = extractor === null ? "sherpa" : "global-recluster";
        yield* sink.progress({
          stage: "diarizing",
          percent: 0.88,
          message: `path=${bridge} embedding=${embeddingId} numClusters=${numClusters} threshold=${CLUSTERING_THRESHOLD} windows=${windows.length}`,
        });
        const chunkTurns: TimedTurn[][] = [];
        const chunkEmbeds: SpeakerEmbed[][] = [];
        for (let index = 0; index < windows.length; index++) {
          if (P.isTruthy(input.signal?.aborted)) return yield* cancelled();
          const window = windows[index];
          if (window === undefined) continue;
          const start = Math.max(0, Math.floor((window.startMs / 1000) * wave.sampleRate));
          const end = Math.min(wave.samples.length, Math.ceil((window.endMs / 1000) * wave.sampleRate));
          const observed = yield* diarizer.process(wave.samples.subarray(start, Math.max(start + 1, end)));
          const raw = Arr.map(observed, (turn) => ({
            startMs: Math.round(turn.start * 1000),
            endMs: Math.round(turn.end * 1000),
            speakerKey: `speaker-${turn.speaker + 1}`,
          }));
          const shifted = shiftTurns(raw, window.startMs);
          chunkTurns.push(shifted);
          const embeds: SpeakerEmbed[] = [];
          if (extractor !== null) {
            const keys: string[] = [];
            const seen = HashSet.empty<string>();
            let known = seen;
            for (const turn of shifted)
              if (turn.speakerKey !== "unknown" && !HashSet.has(known, turn.speakerKey)) {
                known = HashSet.add(known, turn.speakerKey);
                keys.push(turn.speakerKey);
              }
            for (const key of keys) {
              const picked = pickSpeakerEmbedTurns(shifted, key);
              if (picked.length === 0) continue;
              const parts: Float32Array[] = [];
              let total = 0;
              for (const turn of picked) {
                const start = Math.max(0, Math.floor((turn.startMs / 1000) * wave.sampleRate));
                const end = Math.min(wave.samples.length, Math.ceil((turn.endMs / 1000) * wave.sampleRate));
                if (end <= start) continue;
                parts.push(wave.samples.subarray(start, end));
                total += end - start;
              }
              if (total === 0) continue;
              const joined = new Float32Array(total);
              let offset = 0;
              for (const part of parts) {
                joined.set(part, offset);
                offset += part.length;
              }
              const vector = yield* extractor
                .compute({ sampleRate: wave.sampleRate, samples: joined })
                .pipe(Effect.result);
              if (vector._tag === "Failure")
                yield* sink.progress({
                  stage: "diarizing",
                  percent: 0.88 + (0.1 * (index + 1)) / Math.max(1, windows.length),
                  message: `embed-skip ${key}: ${errorMessage(vector.failure._tag === "HostFailure" ? vector.failure.cause : vector.failure)}`,
                });
              else if (vector.success !== null) embeds.push({ speakerKey: key, vector: vector.success });
            }
          }
          chunkEmbeds.push(embeds);
          yield* sink.progress({
            stage: "diarizing",
            percent: 0.88 + (0.1 * (index + 1)) / Math.max(1, windows.length),
            message: `window ${index + 1}/${windows.length}`,
          });
        }
        const embedCount = Arr.reduce(chunkEmbeds, 0, (total, embeds) => total + embeds.length);
        let merged: TimedTurn[] = [];
        if (embedCount > 0)
          merged = mergeChunkTurnsByEmbeddings(windows, chunkTurns, chunkEmbeds, {
            threshold: CLUSTERING_THRESHOLD,
            k: count === "auto" ? undefined : count,
          });
        else
          for (let index = 0; index < chunkTurns.length; index++) {
            const shifted = chunkTurns[index];
            const window = windows[index];
            if (shifted === undefined || window === undefined) continue;
            merged =
              merged.length === 0
                ? shifted
                : mergeChunkTurns(merged, shifted, window.startMs, window.startMs + DIARIZE_OVERLAP_MS);
          }
        const keys = HashSet.fromIterable(Arr.map(merged, (turn) => turn.speakerKey));
        yield* sink.progress({
          stage: "diarizing",
          percent: 0.98,
          message: `path=${bridge} embedding=${embeddingId} numClusters=${numClusters} threshold=${CLUSTERING_THRESHOLD} speakers=${HashSet.size(keys)}`,
        });
        return turnsForAsr(merged, speech, totalMs, { knownCount: count !== "auto" });
      });
      const speakerTurns = Effect.fn("Pipeline.speakerTurns")(function* (
        session: SherpaOperations,
        wave: PcmWave,
        speech: TimeInterval[],
        durationMs: number,
        input: PipelineInput,
        sink: TranscriptionSink,
        manifest: ManifestState | null
      ) {
        if (manifest !== null && manifest.turns.length > 0) return fillUncoveredTurns(manifest.turns, durationMs);
        yield* sink.progress({ stage: "diarizing", percent: 0.88, message: undefined });
        const total = P.isTruthy(durationMs) ? durationMs : Math.round((wave.samples.length / wave.sampleRate) * 1000);
        const turns = yield* diarize(session, wave, speech, total, input, sink);
        if (manifest !== null && P.isTruthy(input.manifestPath) && input.manifestPath !== undefined) {
          const raw = yield* checkpoints.patch(input.manifestPath, { turns });
          yield* refresh(manifest, raw);
        }
        return turns;
      });
      const recognize = Effect.fn("Pipeline.recognize")(function* (
        session: SherpaOperations,
        wave: PcmWave,
        turns: TimedTurn[],
        input: PipelineInput,
        sink: TranscriptionSink,
        manifest: ManifestState | null,
        tier: AsrTierId,
        durationMs: number,
        script: ChineseScript | null
      ) {
        const modelPaths = yield* paths(tier);
        const config = yield* Effect.try({
          try: () => buildOfflineRecognizerConfig(asrTierInfo(tier).family, modelPaths, 2, undefined, provider(), 0),
          catch: (cause) =>
            ModelUnavailable.make({ operation: "recognizer", cause, legacyMessage: errorMessage(cause) }),
        });
        const recognizer = yield* session.recognizer(config);
        let punctuation: Punctuator | null = null;
        let tried = false;
        const keys: string[] = [];
        let seen = HashSet.empty<string>();
        for (const turn of turns)
          if (!HashSet.has(seen, turn.speakerKey)) {
            seen = HashSet.add(seen, turn.speakerKey);
            keys.push(turn.speakerKey);
          }
        const speakers: PipelineSpeaker[] =
          manifest !== null && manifest.speakers.length > 0
            ? manifest.speakers
            : Arr.map(keys, (key, index) => ({
                speakerKey: key,
                displayName: key === "unknown" ? "Unknown speaker" : `Speaker ${index + 1}`,
              }));
        if (
          manifest !== null &&
          P.isTruthy(input.manifestPath) &&
          input.manifestPath !== undefined &&
          manifest.speakers.length === 0
        ) {
          const raw = yield* checkpoints.patch(input.manifestPath, { speakers });
          yield* refresh(manifest, raw);
        }
        const done =
          manifest === null
            ? HashSet.empty<string>()
            : HashSet.fromIterable(Arr.map(manifest.chunks, (chunk) => chunkKey(chunk.startMs, chunk.endMs)));
        const segments: PipelineSegment[] =
          manifest === null
            ? []
            : Arr.map(manifest.chunks, (chunk) =>
                applyChineseScriptToSegment(
                  {
                    speakerKey: chunk.speakerKey,
                    startMs: chunk.startMs,
                    endMs: chunk.endMs,
                    text: chunk.text,
                    words: chunk.words,
                    confidence: chunk.confidence,
                  },
                  script
                )
              );
        for (const segment of segments) yield* sink.partial(segment);
        const pieces = Arr.flatMap(turns, (turn) => splitTurnForAsr(turn));
        for (let index = 0; index < pieces.length; index++) {
          if (P.isTruthy(input.signal?.aborted)) return yield* cancelled();
          const turn = pieces[index];
          if (turn === undefined) continue;
          yield* sink.progress({
            stage: "recognizing",
            percent: 0.6 + (0.35 * index) / Math.max(1, pieces.length),
            message: `asr ${index + 1}/${pieces.length}`,
          });
          if (HashSet.has(done, chunkKey(turn.startMs, turn.endMs))) continue;
          const start = Math.max(0, Math.floor((turn.startMs / 1000) * wave.sampleRate));
          const end = Math.min(wave.samples.length, Math.ceil(((turn.endMs + 200) / 1000) * wave.sampleRate));
          const recognized = yield* recognizer.decode({
            sampleRate: wave.sampleRate,
            samples: wave.samples.subarray(start, Math.max(start + 1, end)),
          });
          let text = Str.trim(recognized.text ?? "");
          if (!P.isTruthy(text)) continue;
          let words = wordsFromAsrResult(recognized, turn.startMs, turn.endMs);
          if (needsPunctuation(text)) {
            if (!tried) {
              tried = true;
              punctuation = yield* awaitAt(tryPunctuation(sink, session), "pipeline.recognize.punctuation");
            }
            if (punctuation !== null) {
              const next = punctuateWords(punctuation, text, words);
              text = next.text;
              words = next.words ?? words;
            }
          }
          const segment = applyChineseScriptToSegment(
            {
              speakerKey: turn.speakerKey === "unknown" ? null : turn.speakerKey,
              startMs: turn.startMs,
              endMs: turn.endMs,
              text,
              words,
              confidence: null,
            },
            script
          );
          segments.push(segment);
          yield* sink.partial(segment);
          if (P.isTruthy(input.manifestPath) && input.manifestPath !== undefined)
            yield* checkpoints.append(
              input.manifestPath,
              {
                index,
                startMs: turn.startMs,
                endMs: turn.endMs,
                speakerKey: segment.speakerKey,
                text: segment.text,
                words: segment.words,
                confidence: null,
              },
              { speakers, durationMs }
            );
        }
        return { speakers, segments: segments.sort((left, right) => left.startMs - right.startMs) };
      });
      return Pipeline.of({
        run: Effect.fn("SherpaPipeline.run")(function* (input, sink) {
          if (P.isTruthy(input.signal?.aborted)) return yield* cancelled();
          const count = parseSpeakerCount(input.speakerCount, DEFAULT_SPEAKER_COUNT);
          const seed = input.existingTranscript;
          const tier = parseAsrTier(seed?.asrTier ?? input.asrTier, DEFAULT_ASR_TIER);
          if (P.isTruthy(seed?.segments.length) && seed !== undefined && count === 1) {
            const result = yield* awaitAt(
              commitSeed(input, sink, seed, singleSpeakerTurns(seedDurationMs(seed)), tier),
              "pipeline.commitSeed.return"
            );
            return result;
          }
          const runVad = !input.skipVad && input.autoSkipAllowed && !P.isTruthy(seed);
          const loadSpeaker = count !== 1;
          const loadAsr = !P.isTruthy(seed);
          yield* sink.progress({
            stage: "preparing-models",
            percent: null,
            message: runVad ? "vad" : loadAsr ? "asr" : "speaker",
          });
          if (runVad) yield* models.ensureReady({ groups: ["vad"] });
          yield* sink.progress({
            stage: runVad ? "detecting-speech" : "recognizing",
            percent: 0.05,
            message: undefined,
          });
          const session = yield* driver.session;
          const wave = yield* audio.readPcm(input.wavPath);
          const waveMs = Math.round((wave.samples.length / Math.max(1, wave.sampleRate)) * 1000);
          const durationMs = waveMs > 0 ? waveMs : input.durationMs;
          const speech = runVad ? yield* speechIntervals(session, wave, input) : [];
          const hasSpeech = !runVad || speech.length > 0;
          const script = chineseScriptOf(input.language ?? "");
          if (!hasSpeech && input.autoSkipAllowed && !P.isTruthy(seed)) {
            yield* sink.progress({ stage: "committing", percent: 1, message: "no-speech" });
            return { resultKind: "no-speech", language: null, modelVersion, asrTier: tier, speakers: [], segments: [] };
          }
          if (P.isTruthy(seed?.segments.length) && seed !== undefined) {
            if (loadSpeaker) {
              yield* sink.progress({ stage: "preparing-models", percent: 0.3, message: "speaker" });
              yield* models.ensureReady({ groups: ["speaker"] });
            }
            const turns = yield* speakerTurns(session, wave, speech, durationMs, input, sink, null);
            const result = yield* awaitAt(
              commitSeed(input, sink, seed, turns, tier, session),
              "pipeline.commitSeed.return"
            );
            return result;
          }
          if (loadAsr) {
            yield* sink.progress({ stage: "preparing-models", percent: 0.3, message: "asr" });
            yield* models.ensureReady({ groups: ["asr"], tiers: [tier] });
          }
          const manifest =
            P.isTruthy(input.manifestPath) && input.manifestPath !== undefined
              ? yield* loadManifest(input.manifestPath)
              : null;
          yield* sink.progress({ stage: "recognizing", percent: 0.35, message: undefined });
          const base =
            runVad && speech.length > 0
              ? Arr.map(speech, (interval) => ({ ...interval, speakerKey: "speaker-1" }))
              : [];
          const turns = Arr.map(fillUncoveredTurns(base, durationMs), (turn) => ({ ...turn, speakerKey: "speaker-1" }));
          const recognized = yield* awaitAt(
            recognize(session, wave, turns, input, sink, manifest, tier, durationMs, script),
            "pipeline.recognize.return"
          );
          if (loadSpeaker) {
            yield* sink.progress({ stage: "preparing-models", percent: 0.85, message: "speaker" });
            yield* models.ensureReady({ groups: ["speaker"] });
          }
          const overlay = loadSpeaker
            ? yield* speakerTurns(session, wave, speech, durationMs, input, sink, manifest)
            : singleSpeakerTurns(durationMs);
          const assigned = assignSpeakersToSegments(recognized.segments, overlay);
          yield* sink.progress({ stage: "committing", percent: 1, message: undefined });
          return {
            resultKind: "transcript",
            language: languageAfterChineseScript(assigned.segments, script),
            modelVersion,
            asrTier: tier,
            speakers: assigned.speakers,
            segments: assigned.segments,
          };
        }),
      });
    })
  );
