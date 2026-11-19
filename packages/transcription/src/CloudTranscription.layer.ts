import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { Audio } from "./Audio.service.js";
import { CloudTranscriptionResult } from "./Cloud.model.js";
import { CloudClipBounds, CloudSavedClip, CloudSavedResult } from "./CloudRun.model.js";
import { CloudFileIO, CloudTranscription } from "./CloudTranscription.service.js";
import { manifestWorkKey } from "./chunk-manifest.js";
import { cloudClipWav } from "./cloud-runner.js";
import { withModelCleanup } from "./ModelLifetime.js";
import { AudioFailure, BoundaryDecodeError, HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionIds } from "./TranscriptionIds.service.js";
import { BinaryWaveReader } from "./WaveReader.service.js";
import type { CloudPcmFile } from "./CloudTranscription.service.js";
import type { PipelineResult, PipelineSegment } from "./Pipeline.model.js";

const SAMPLE_RATE = 16000;
const CLIP_SAMPLES = 320000;
const invalid = (message: string) => AudioFailure.make({ operation: "cloud-audio", legacyMessage: message });
const boundary = (operation: string) =>
  BoundaryDecodeError.make({ operation, legacyMessage: `Invalid transcription data at ${operation}.` });
export const layer = Layer.effect(
  CloudTranscription,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const io = yield* CloudFileIO;
    const binary = yield* BinaryWaveReader;
    const path = yield* Path.Path;
    const ids = yield* TranscriptionIds;
    const audio = yield* Audio;
    const pcmPayload = Effect.fn("CloudTranscription.pcmPayload")(function* (file: CloudPcmFile) {
      const header = new Uint8Array(12);
      yield* file.read(header, 0);
      const head = binary.view(header);
      if (head.ascii(0, 4) !== "RIFF" || head.ascii(8, 12) !== "WAVE")
        return yield* invalid("ffmpeg did not produce PCM WAV audio");
      const size = yield* file.size;
      let format = false;
      for (let offset = 12; offset + 8 <= size; ) {
        const bytes = new Uint8Array(8);
        yield* file.read(bytes, offset);
        const chunk = binary.view(bytes);
        const length = chunk.uint32(4);
        if (offset + 8 + length > size) return yield* invalid("ffmpeg produced truncated WAV audio");
        if (chunk.ascii(0, 4) === "fmt ") {
          const formatBytes = new Uint8Array(16);
          yield* file.read(formatBytes, offset + 8);
          const fmt = binary.view(formatBytes);
          format =
            length >= 16 &&
            fmt.uint16(0) === 1 &&
            fmt.uint16(2) === 1 &&
            fmt.uint32(4) === SAMPLE_RATE &&
            fmt.uint16(14) === 16;
        } else if (chunk.ascii(0, 4) === "data") {
          if (!format || length === 0 || length % 2 !== 0)
            return yield* invalid("ffmpeg produced unsupported PCM audio");
          return { offset: offset + 8, samples: length / 2 };
        }
        offset += 8 + length + (length % 2);
      }
      return yield* invalid("ffmpeg audio payload is missing");
    });
    const clipBoundary = (pcm: Uint8Array): number => {
      const samples = pcm.byteLength / 2;
      if (samples < CLIP_SAMPLES) return samples;
      const window = SAMPLE_RATE / 10;
      let best = samples;
      let quietest = Number.POSITIVE_INFINITY;
      const view = binary.view(pcm);
      for (let start = 15 * SAMPLE_RATE; start + window <= samples; start += window) {
        let energy = 0;
        for (let sample = start; sample < start + window; sample++) {
          const value = view.int16(sample * 2);
          energy += value * value;
        }
        if (energy <= quietest) {
          quietest = energy;
          best = start + window / 2;
        }
      }
      return best;
    };
    return CloudTranscription.of({
      run: Effect.fn("CloudTranscription.run")(function* (input, sink) {
        yield* sink.checkAbort;
        const fingerprint = yield* io.fingerprint(input.sourceFilePath);
        const key = manifestWorkKey(input.taskId, fingerprint, `cloud-v1:${input.modelId}`);
        const directory = path.join(input.workRoot, "vidbee-transcript", key);
        yield* files.mkdir(directory, true);
        const saved = yield* io.load(path.join(directory, "cloud.json"), input.accountId);
        if ((yield* saved.accountId) !== input.accountId)
          return yield* invalid("Sign in with the Cloud account that started this transcription");
        yield* sink.progress("preparing-audio", null);
        const extracted = yield* audio.extract({
          sourceFilePath: input.sourceFilePath,
          ffmpegPath: input.ffmpegPath,
          outputDir: directory,
          signal: input.signal,
        });
        yield* sink.checkAbort;
        const file = yield* io.open(extracted.wavPath);
        return yield* withModelCleanup(
          Effect.gen(function* () {
            const segments: PipelineSegment[] = [];
            let language: string | null = null;
            const payload = yield* pcmPayload(file);
            let start = 0;
            let index = 0;
            while (start < payload.samples) {
              yield* sink.checkAbort;
              const pcm = new Uint8Array(Math.min(CLIP_SAMPLES, payload.samples - start) * 2);
              const bytesRead = yield* file.read(pcm, payload.offset + start * 2);
              if (bytesRead !== pcm.length) return yield* invalid("Extracted audio changed during Cloud transcription");
              const end = start + clipBoundary(pcm);
              const value = yield* saved.clipAt(index);
              let clip: CloudSavedClip;
              if (Boolean(value) === true) {
                if (!S.is(CloudClipBounds)(value) || value.start !== start || value.end !== end)
                  return yield* invalid("Cloud transcription checkpoint does not match the audio");
                if (!S.is(CloudSavedClip)(value)) return yield* boundary("cloud.clip");
                clip = value;
              } else {
                clip = { start, end, requestId: yield* ids.uuid };
                yield* saved.append(clip);
                yield* saved.save;
              }
              yield* sink.progress("recognizing", start / payload.samples);
              if (Boolean(clip.result) === false) {
                for (let restart = 0; restart < 2; restart++) {
                  const outcome = yield* Effect.gen(function* () {
                    const returned = yield* sink.transcribe(
                      cloudClipWav(pcm.subarray(0, (end - start) * 2)),
                      clip.requestId,
                      input.signal
                    );
                    if (!S.is(CloudTranscriptionResult)(returned)) return yield* boundary("cloud.clipResult");
                    clip.result = returned;
                    yield* saved.save;
                  }).pipe(Effect.result);
                  if (outcome._tag === "Success") break;
                  const error = outcome.failure;
                  const details = yield* sink.failureInfo(S.is(HostFailure)(error) ? error.cause : error);
                  if (details.failedReservation) {
                    clip.requestId = yield* ids.uuid;
                    yield* saved.save;
                    if (details.conflict && restart === 0) continue;
                  }
                  return yield* error;
                }
              }
              const result = clip.result;
              if (Boolean(result) === false) return yield* invalid("Cloud transcription did not return a clip result");
              if (!S.is(CloudSavedResult)(result)) return yield* boundary("cloud.clipResult");
              language ??= result.language;
              if (result.text !== "") {
                const segment: PipelineSegment = {
                  speakerKey: null,
                  startMs: Math.round((start / SAMPLE_RATE) * 1000),
                  endMs: Math.round((end / SAMPLE_RATE) * 1000),
                  text: result.text,
                  words: [],
                  confidence: null,
                };
                segments.push(segment);
                yield* sink.partial(segment);
              }
              start = end;
              index++;
            }
            yield* sink.progress("committing", 1);
            const result: PipelineResult = {
              resultKind: segments.length > 0 ? "transcript" : "no-speech",
              language,
              modelVersion: `cloud:${input.modelId}`,
              asrTier: `cloud:${input.modelId}`,
              sourceKind: "asr",
              speakers: [],
              segments,
            };
            return {
              cleanup: files.remove(directory, true, true).pipe(Effect.ignore),
              durationMs: Math.round((payload.samples / SAMPLE_RATE) * 1000),
              result,
            };
          }),
          file.close
        );
      }),
    });
  })
);
