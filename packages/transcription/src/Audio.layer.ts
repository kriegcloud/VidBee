import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Str from "effect/String";
import { Audio, AudioAbort } from "./Audio.service.js";
import { isReusableExtractedWav, TARGET_SAMPLE_RATE } from "./audio.js";
import { isNoAudioStreamError, NO_AUDIO_STREAM_ERROR } from "./errors.js";
import { AudioFailure, HostFailure, SourceUnavailable } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionProcess } from "./TranscriptionProcess.service.js";
import { WaveReader } from "./WaveReader.service.js";
import type { ProcessOutcome } from "@vidbee/downloader-core/Process.model";
import type { AudioExtractInput } from "./Audio.model.js";
import type { TranscriptionProcessSpec } from "./TranscriptionProcess.model.js";

const failure = (operation: string, message: string) => AudioFailure.make({ operation, legacyMessage: message });
const originalFailure = (operation: string, cause: unknown) =>
  HostFailure.make({ operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause });
export const abortLayer = Layer.succeed(AudioAbort, {
  subscribe: Effect.fn("AudioAbort.subscribe")((signal, action) =>
    Effect.callback<void, HostFailure>((resume) => {
      const listener = () => resume(action);
      signal.addEventListener("abort", listener, { once: true });
      return Effect.sync(() => signal.removeEventListener("abort", listener));
    }).pipe(
      Effect.catchCause((cause) => Effect.logError("audio abort signal failed", cause)),
      Effect.forkScoped({ startImmediately: true }),
      Effect.map((fiber) => Fiber.interrupt(fiber))
    )
  ),
});
/** Cleanup retains the old finally rule: cleanup failure replaces the prior failure. */
const finalize = <A, E, R, E2, R2>(effect: Effect.Effect<A, E, R>, cleanup: Effect.Effect<void, E2, R2>) =>
  Effect.uninterruptibleMask((restore) =>
    restore(effect).pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => cleanup.pipe(Effect.andThen(Effect.failCause(cause))),
        onSuccess: (value) => cleanup.pipe(Effect.as(value)),
      })
    )
  );
export const make = Effect.fnUntraced(function* () {
  const files = yield* TranscriptionFiles;
  const host = yield* TranscriptionHost;
  const path = yield* Path.Path;
  const processes = yield* TranscriptionProcess;
  const wave = yield* WaveReader;
  const timing = yield* LegacyTiming;
  const aborts = yield* AudioAbort;
  const awaitAt = <A, E, R>(effect: Effect.Effect<A, E, R>, point: string) =>
    effect.pipe(Effect.onExit(() => timing.turn(point)));
  const ffprobePath = (ffmpeg: string) =>
    Str.endsWith("ffmpeg.exe")(ffmpeg)
      ? Str.replace(/ffmpeg\.exe$/i, "ffprobe.exe")(ffmpeg)
      : path.join(path.dirname(ffmpeg), "ffprobe");
  const capture = Effect.fnUntraced(function* (
    spec: TranscriptionProcessSpec,
    conversion: boolean,
    signal?: AbortSignal
  ) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Effect.scope;
        const result = yield* Deferred.make<ProcessOutcome, HostFailure>();
        let stdout = "";
        let stderr = "";
        let ended = false;
        let removeAbort: Effect.Effect<void> = Effect.void;
        const started = yield* processes.start(
          spec,
          {
            abort: Effect.void,
            emit: Effect.fn("Audio.processEvent")((event) =>
              Effect.suspend(() => {
                if (event._tag === "stdout")
                  stdout += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
                else if (event._tag === "stderr")
                  stderr += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
                else if (event._tag === "rawError") {
                  ended = true;
                  return removeAbort.pipe(
                    Effect.andThen(Deferred.fail(result, originalFailure("audioProcessEvent", event.error))),
                    Effect.asVoid
                  );
                } else if (event._tag === "complete") {
                  ended = true;
                  return removeAbort.pipe(Effect.andThen(Deferred.succeed(result, event.outcome)), Effect.asVoid);
                }
                return Effect.void;
              })
            ),
          },
          owner
        );
        if (started._tag === "NativeSpawnFailure") return yield* originalFailure("nativeSpawn", started.error);
        if (conversion && started.run.process.pid !== undefined) yield* host.lowerPriority(started.run.process.pid);
        if (signal !== undefined && !ended)
          removeAbort = yield* Effect.acquireRelease(
            aborts.subscribe(
              signal,
              started.run.process.signalChild("SIGTERM").pipe(
                Effect.mapError((error) =>
                  HostFailure.make({
                    operation: error.operation,
                    legacyMessage: error.legacyMessage,
                    cause: error.cause,
                  })
                )
              )
            ),
            (cancel) => Effect.suspend(() => (ended ? Effect.void : cancel))
          );
        const outcome = yield* Deferred.await(result);
        return { stdout, stderr, outcome };
      })
    );
  });
  const probeSpec = (command: string, argv: string[]): TranscriptionProcessSpec => ({
    command,
    argv,
    env: undefined,
    extendEnv: true,
    cwd: undefined,
    detached: false,
    windowsHide: false,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    stdoutConsumption: "deliver",
    stderrConsumption: "unread",
  });
  const recoverProbe = (error: HostFailure) =>
    error.operation === "audioProcessEvent" || error.operation === "nativeSpawn";
  const duration = Effect.fnUntraced(function* (ffmpeg: string, file: string) {
    const bin = ffprobePath(ffmpeg);
    const exists = yield* files.exists(bin);
    if (!exists) return 0;
    const captured = yield* awaitAt(
      capture(
        probeSpec(bin, [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          file,
        ]),
        false
      ).pipe(Effect.catchIf(recoverProbe, () => Effect.succeed(null))),
      "audio.probeDuration.adoption"
    );

    if (captured === null || (captured.outcome._tag === "Native" && captured.outcome.result._tag === "Failure"))
      return 0;
    const seconds = Number.parseFloat(Str.trim(captured.stdout));
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
  });
  const hasAudio = Effect.fnUntraced(function* (ffmpeg: string, file: string) {
    const bin = ffprobePath(ffmpeg);
    const exists = yield* files.exists(bin);
    if (!exists) return true;
    const captured = yield* awaitAt(
      capture(
        probeSpec(bin, [
          "-v",
          "error",
          "-select_streams",
          "a",
          "-show_entries",
          "stream=codec_type",
          "-of",
          "csv=p=0",
          file,
        ]),
        false
      ).pipe(Effect.catchIf(recoverProbe, () => Effect.succeed(null))),
      "audio.probeHasAudio.adoption"
    );

    if (captured === null || (captured.outcome._tag === "Native" && captured.outcome.result._tag === "Failure"))
      return true;
    return Str.trim(captured.stdout).length > 0;
  });
  const runFfmpeg = Effect.fnUntraced(function* (bin: string, argv: string[], signal?: AbortSignal) {
    const snapshot = yield* host.snapshot;
    const captured = yield* capture(
      {
        command: bin,
        argv,
        env: undefined,
        extendEnv: true,
        cwd: undefined,
        detached: snapshot.platform !== "win32",
        windowsHide: false,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        stdoutConsumption: "unread",
        stderrConsumption: "deliver",
      },
      true,
      signal
    );
    const outcome = captured.outcome;
    if (outcome._tag === "Native" && outcome.result._tag === "Failure")
      return yield* originalFailure("runFfmpeg", outcome.result.error);
    const code =
      outcome._tag === "Raw" ? outcome.code : outcome.result._tag === "ExitCode" ? outcome.result.code : null;
    if (code === 0) return;
    if (isNoAudioStreamError(captured.stderr)) return yield* failure("runFfmpeg", NO_AUDIO_STREAM_ERROR);
    return yield* failure("runFfmpeg", `ffmpeg conversion failed (exit ${code}): ${Str.slice(-2000)(captured.stderr)}`);
  });
  const remux = Effect.fnUntraced(function* (input: AudioExtractInput, wavPath: string) {
    const copyPath = path.join(input.outputDir, "audio-copy.m4a");
    yield* finalize(
      Effect.gen(function* () {
        yield* awaitAt(
          runFfmpeg(
            input.ffmpegPath,
            ["-y", "-i", input.sourceFilePath, "-map", "0:a:0", "-vn", "-sn", "-dn", "-c", "copy", copyPath],
            input.signal
          ),
          "audio.remux.copy"
        );

        yield* awaitAt(
          runFfmpeg(
            input.ffmpegPath,
            ["-y", "-i", copyPath, "-ac", "1", "-ar", String(TARGET_SAMPLE_RATE), "-threads", "2", wavPath],
            input.signal
          ),
          "audio.remux.decode"
        );
      }),
      files.remove(copyPath, false, true)
    );
    const exists = yield* files.exists(wavPath);
    if (!exists) return yield* failure("remux", "ffmpeg conversion failed: empty wav after remux");
    const stat = yield* files.stat(wavPath);
    if (stat.size <= 0) return yield* failure("remux", "ffmpeg conversion failed: empty wav after remux");
    const ms = yield* awaitAt(duration(input.ffmpegPath, wavPath), "audio.remux.returnDuration");

    return ms;
  });
  return Audio.of({
    readPcm: wave.read,
    extract: Effect.fn("Audio.extract")(function* (input) {
      const sourceExists = yield* files.exists(input.sourceFilePath);
      if (!sourceExists)
        return yield* SourceUnavailable.make({
          operation: "extract",
          legacyMessage: `source file missing: ${input.sourceFilePath}`,
        });
      const sourceStat = yield* files.stat(input.sourceFilePath);
      if (sourceStat.size <= 0)
        return yield* SourceUnavailable.make({
          operation: "extract",
          legacyMessage: `source file missing: ${input.sourceFilePath}`,
        });
      const ffmpegExists = yield* files.exists(input.ffmpegPath);
      if (!ffmpegExists)
        return yield* SourceUnavailable.make({
          operation: "extract",
          legacyMessage: `ffmpeg not found: ${input.ffmpegPath}`,
        });
      yield* files.mkdir(input.outputDir, true);
      const wavPath = path.join(input.outputDir, "audio-16k-mono.wav");
      const sourceMs = yield* awaitAt(duration(input.ffmpegPath, input.sourceFilePath), "audio.extract.sourceDuration");

      const cacheExists = yield* files.exists(wavPath);
      if (cacheExists) {
        const cacheStat = yield* files.stat(wavPath);
        if (cacheStat.size > 0) {
          const cachedMs = yield* awaitAt(duration(input.ffmpegPath, wavPath), "audio.extract.cachedDuration");

          if (isReusableExtractedWav(cachedMs, sourceMs)) return { wavPath, durationMs: cachedMs };
        }
      }
      const audio = yield* awaitAt(hasAudio(input.ffmpegPath, input.sourceFilePath), "audio.extract.hasAudio");

      if (!audio) return yield* failure("extract", NO_AUDIO_STREAM_ERROR);
      yield* awaitAt(
        runFfmpeg(
          input.ffmpegPath,
          [
            "-y",
            "-i",
            input.sourceFilePath,
            "-ac",
            "1",
            "-ar",
            String(TARGET_SAMPLE_RATE),
            "-threads",
            "2",
            "-vn",
            wavPath,
          ],
          input.signal
        ),
        "audio.extract.convert"
      );

      const wavExists = yield* files.exists(wavPath);
      if (!wavExists) return yield* failure("extract", "ffmpeg conversion failed: empty wav");
      const wavStat = yield* files.stat(wavPath);
      if (wavStat.size <= 0) return yield* failure("extract", "ffmpeg conversion failed: empty wav");
      let durationMs = yield* awaitAt(duration(input.ffmpegPath, wavPath), "audio.extract.wavDuration");

      if (!isReusableExtractedWav(durationMs, sourceMs)) {
        durationMs = yield* awaitAt(remux(input, wavPath), "audio.extract.remux");
      }
      if (!isReusableExtractedWav(durationMs, sourceMs))
        return yield* failure("extract", `ffmpeg conversion truncated: wav ${durationMs}ms vs source ${sourceMs}ms`);
      return { wavPath, durationMs };
    }),
  });
});
export const layer = Layer.effect(Audio, make());
