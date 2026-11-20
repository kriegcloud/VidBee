import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { AtomicFiles } from "./AtomicFiles.service.js";
import { Audio } from "./Audio.service.js";
import { ASR_TIER_IDS } from "./asr-tiers.js";
import { Checkpoints } from "./Checkpoints.service.js";
import { SeedFiles } from "./SeedFiles.service.js";
import { seedDurationMs } from "./speaker-assign.js";
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount } from "./speaker-count.js";
import { BoundaryDecodeError } from "./Transcription.errors.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { WorkerProbeMessage } from "./Worker.model.js";
import { WorkerHandler, WorkerOutput, WorkerSessionFactory } from "./WorkerHandler.service.js";
import { WORKER_RESULT_FILE } from "./WorkerProtocol.layer.js";
import type { TranscriptionStage } from "./Literal.model.js";
import type { TranscriptionError } from "./Transcription.errors.js";

const text = (error: TranscriptionError): string =>
  error._tag === "HostFailure"
    ? error.cause instanceof Error
      ? error.cause.message
      : String(error.cause)
    : error.legacyMessage;
const samples = (seconds: number): Float32Array => {
  const wave = new Float32Array(Math.round(16000 * seconds));
  for (let i = 0; i < wave.length; i++) wave[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.05;
  return wave;
};
export const WorkerHandlerLive = Layer.effect(
  WorkerHandler,
  Effect.gen(function* () {
    const output = yield* WorkerOutput;
    const factory = yield* WorkerSessionFactory;
    const time = yield* TranscriptionTime;
    const audio = yield* Audio;
    const checkpoints = yield* Checkpoints;
    const seeds = yield* SeedFiles;
    const atomic = yield* AtomicFiles;
    const path = yield* Path.Path;
    return WorkerHandler.of({
      probe: Effect.fn("WorkerHandler.probe")((raw) =>
        Effect.gen(function* () {
          if (yield* factory.fakeProbe) {
            yield* output.send({ type: "probe-ok" });
            return;
          }
          const message = yield* S.decodeUnknownEffect(WorkerProbeMessage)(raw).pipe(
            Effect.mapError((cause) =>
              BoundaryDecodeError.make({
                operation: "worker-input",
                cause,
                legacyMessage: "Invalid transcription data at worker-input.",
              })
            )
          );
          const addon = yield* factory.probeAddon;
          const session = yield* factory.create(message.modelsDir);
          const provider = message.provider ?? "cpu";
          const tiers = message.asrTier === undefined ? ASR_TIER_IDS : [message.asrTier];
          let probed = false;
          let durationMs: number | undefined;
          for (const tier of tiers) {
            const config = yield* session.config(tier, provider);
            if (config === null) continue;
            const recognizer = yield* addon.recognizer(config);
            probed = true;
            if (P.isTruthy(message.benchmark)) yield* recognizer.probe(samples(0.2));
            durationMs = yield* recognizer.probe(samples(P.isTruthy(message.benchmark) ? 1 : 0.3));
            break;
          }
          if (!probed && message.asrTier !== undefined) {
            yield* output.send({ type: "error", message: `provider probe model unavailable: ${message.asrTier}` });
            return;
          }
          yield* output.send({ type: "probe-ok", provider, durationMs });
        }).pipe(Effect.catch((error) => output.send({ type: "error", message: text(error) })))
      ),
      start: Effect.fn("WorkerHandler.start")(function* (message, signal) {
        let stage: TranscriptionStage = "preparing-audio";
        const cancel = yield* time.every(
          10000,
          Effect.suspend(() => output.send({ type: "progress", stage, percent: null, message: "heartbeat" })),
          { keepAlive: true }
        );
        yield* Effect.gen(function* () {
          yield* output.send({ type: "log", stream: "stdout", line: `compute.provider=${message.provider}` });
          yield* output.send({ type: "progress", stage: "preparing-audio", percent: 0, message: "extract" });
          yield* checkpoints.ensure({
            workDir: message.workDir,
            taskId: message.taskId,
            fingerprint: message.fingerprint,
            modelVersion: message.modelVersion,
          });
          const existing =
            P.isTruthy(message.existingTranscriptPath) && message.existingTranscriptPath !== undefined
              ? yield* seeds.load(message.existingTranscriptPath)
              : null;
          const skipAudio = existing !== null && parseSpeakerCount(message.speakerCount, DEFAULT_SPEAKER_COUNT) === 1;
          const session = yield* factory.create(message.modelsDir);
          const preparation = yield* session.beginPrepare(
            message.asrTier,
            message.backend === "fake" || existing !== null
          );
          const extracted = skipAudio
            ? { wavPath: message.sourceFilePath, durationMs: existing === null ? 0 : seedDurationMs(existing) }
            : yield* audio.extract({
                sourceFilePath: message.sourceFilePath,
                ffmpegPath: message.ffmpegPath,
                outputDir: message.workDir,
                signal,
              });
          yield* preparation.wait;
          const result = yield* session.run(
            message,
            {
              sourceFilePath: message.sourceFilePath,
              wavPath: extracted.wavPath,
              durationMs: extracted.durationMs,
              skipVad: message.skipVad,
              autoSkipAllowed: message.autoSkipAllowed,
              asrTier: message.asrTier,
              language: message.language,
              speakerCount: message.speakerCount,
              existingTranscript: existing ?? undefined,
              signal,
              manifestPath: checkpoints.manifestPath(message.workDir),
            },
            {
              progress: (progress) =>
                Effect.suspend(() => {
                  stage = progress.stage;
                  return output.send({
                    type: "progress",
                    stage: progress.stage,
                    percent: progress.percent,
                    message: progress.message,
                  });
                }),
              partial: (segment) =>
                output.send({
                  type: "partial",
                  speakerKey: segment.speakerKey,
                  startMs: segment.startMs,
                  endMs: segment.endMs,
                  text: segment.text,
                  words: segment.words,
                }),
              log: (stream, line) => output.send({ type: "log", stream, line }),
            }
          );
          yield* atomic.writeJson(path.join(message.workDir, WORKER_RESULT_FILE), result);
          yield* output.send({ type: "result", resultPath: WORKER_RESULT_FILE, durationMs: extracted.durationMs });
        }).pipe(
          Effect.catch((error) => {
            const message = text(error);
            return output.send({
              type: "error",
              message: signal.aborted || /cancelled/i.test(message) ? "cancelled" : message,
            });
          }),
          Effect.ensuring(cancel)
        );
      }),
    });
  })
);
