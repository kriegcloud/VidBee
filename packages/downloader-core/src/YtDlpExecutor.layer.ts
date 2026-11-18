import { virtualError } from "@vidbee/task-queue/classifier";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Str from "effect/String";
import { DownloadFiles } from "./DownloadFiles.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import * as Helpers from "./YtDlpExecutor.helpers.js";
import { YtDlpExecutorHost } from "./YtDlpExecutorHost.service.js";
import { YtDlpProcess } from "./YtDlpProcess.service.js";
import {
  cookieSourcesFromArgs,
  isUnsupportedThumbnailEmbedOnlyFailure,
  THUMBNAIL_EMBED_UNSUPPORTED_LOG,
} from "./yt-dlp-args.js";
import { DownloadProgressAggregator } from "./yt-dlp-progress.js";
import type { ExecutorFinishEvent } from "@vidbee/task-queue/Executor.model";
import type { TaskOutput } from "@vidbee/task-queue/Task.model";
import type { ExecutorHandle } from "@vidbee/task-queue/TaskExecutor.service";
import type * as FiberModel from "effect/Fiber";
import type { ProcessRun } from "./DownloadProcess.service.js";
import type { WrapperObservation } from "./YtDlpWrapper.model.js";

const noop: ExecutorHandle = { cancel: Effect.fn("YtDlpExecutor.noopCancel")(() => Effect.void), pause: Effect.void };

/** Native executor kernel; compatibility hosts provide synchronous effects for old hooks. */
export const layer = Layer.effect(
  TaskExecutor,
  Effect.gen(function* () {
    const host = yield* YtDlpExecutorHost;
    const process = yield* YtDlpProcess;
    const files = yield* DownloadFiles;
    const timing = yield* DownloadTiming;
    const scope = yield* Effect.scope;
    return TaskExecutor.of({
      run: Effect.fn("YtDlpExecutor.run")(function* (ctx, sink) {
        const stdoutTail = Helpers.createTailBuffer(Helpers.STDOUT_TAIL_BYTES);
        const stderrTail = Helpers.createTailBuffer(Helpers.STDERR_TAIL_BYTES);
        const processingLines = { stdout: "", stderr: "" };
        let postprocessSeen = false;
        let settled = false;
        let cancelRequested = false;
        let processRun: ProcessRun | undefined;
        let killTimer: FiberModel.Fiber<void> | undefined;
        let formatIdSeen: string | undefined;
        let filePathSeen: string | undefined;
        let outputPathProbe = "";
        let subtitleSignalProbe = "";
        let subtitleUnavailableSeen = false;
        let mediaDurationMs: number | null = null;
        let subtitleVisibility: "public" | "private" | "unlisted" | undefined;
        let subtitleLanguagesSeen = HashSet.empty<string>();
        const subtitleLanguages: string[] = [];
        let progressAggregator = new DownloadProgressAggregator();
        let subtitleFallbackAttempted = false;
        const identity = { taskId: ctx.taskId, attemptId: ctx.attemptId };
        const finishOnce = Effect.fn("YtDlpExecutor.finishOnce")(function* (event: ExecutorFinishEvent) {
          if (settled) return;
          settled = true;
          if (killTimer !== undefined) {
            yield* Fiber.interrupt(killTimer);
            killTimer = undefined;
          }
          yield* sink.emit({ type: "finish", ...event });
        });
        const finishError = Effect.fn("YtDlpExecutor.finishError")(function* (message: string, binaryMissing: boolean) {
          yield* finishOnce({
            ...identity,
            closedAt: host.now(),
            stdoutTail: stdoutTail.read(),
            stderrTail: stderrTail.read(),
            result: cancelRequested
              ? { type: "cancelled" }
              : {
                  type: "error",
                  error: binaryMissing
                    ? virtualError("binary-missing", message)
                    : Helpers.classifyYtDlpExit({
                        exitCode: null,
                        stderr: `${stderrTail.read()}\n${message}`,
                        now: host.now(),
                      }),
                  exitCode: null,
                },
          });
        });
        const preflightFailure = Effect.fn("YtDlpExecutor.preflightFailure")(function* (
          message: string,
          kind: "unknown" | "binary-missing",
          includeMessage: boolean
        ) {
          yield* finishOnce({
            ...identity,
            closedAt: host.now(),
            stdoutTail: includeMessage ? "" : stdoutTail.read(),
            stderrTail: includeMessage ? message : stderrTail.read(),
            result: { type: "error", error: virtualError(kind, message), exitCode: null },
          });
        });
        const capture = Effect.fn("YtDlpExecutor.capture")(function* (text: string, stream: "stdout" | "stderr") {
          outputPathProbe = Str.slice(-Helpers.OUTPUT_PATH_SCAN_BYTES)(`${outputPathProbe}${text}`);
          filePathSeen = Helpers.extractSavedFilePath(outputPathProbe) ?? filePathSeen;
          subtitleSignalProbe = Str.slice(-Helpers.OUTPUT_PATH_SCAN_BYTES)(`${subtitleSignalProbe}${text}`);
          const duration = /VIDBEE_DURATION:(\d+(?:\.\d+)?)/.exec(subtitleSignalProbe);
          if (duration !== null) mediaDurationMs = Number(duration[1]) * 1000;
          const visibility = /VIDBEE_VISIBILITY:(public|private|unlisted)\b/.exec(subtitleSignalProbe)?.[1];
          if (visibility === "public" || visibility === "private" || visibility === "unlisted")
            subtitleVisibility = visibility;
          for (const language of Helpers.extractDownloadedSubtitleLanguages(subtitleSignalProbe)) {
            if (!HashSet.has(subtitleLanguagesSeen, language)) {
              subtitleLanguagesSeen = HashSet.add(subtitleLanguagesSeen, language);
              subtitleLanguages.push(language);
            }
          }
          if (Helpers.SUBTITLE_UNAVAILABLE_INFO.test(subtitleSignalProbe)) subtitleUnavailableSeen = true;
          if (postprocessSeen || settled || cancelRequested) return;
          const lines = Str.split(Helpers.OUTPUT_LINE_END)(`${processingLines[stream]}${text}`);
          processingLines[stream] = Str.slice(-Helpers.OUTPUT_PATH_SCAN_BYTES)(lines.pop() ?? "");
          if (A.some(lines, (line) => Helpers.PROCESSING_LINE.test(Str.trimStart(line)))) {
            postprocessSeen = true;
            yield* sink.emit({ type: "processing", ...identity });
          }
        });
        let launched: ExecutorHandle | undefined;
        const pendingCancel = Effect.fn("YtDlpExecutor.pendingCancel")(function* (timeout?: number) {
          cancelRequested = true;
          if (launched !== undefined) yield* launched.cancel(timeout);
        });
        const launch = Effect.fn("YtDlpExecutor.launch")(function* (
          settings?: import("./types.js").DownloadRuntimeSettings
        ) {
          if (cancelRequested || settled) return noop;
          const command = yield* Effect.result(host.command(ctx.input, settings));
          if (Result.isFailure(command)) {
            yield* preflightFailure(command.failure.legacyMessage, "unknown", true);
            return noop;
          }
          const { args, initialSubtitleStatus, canRetryWithoutSubtitles } = command.success;
          const subtitlesRequested = Helpers.hasSubtitleDownloadArgs(args);
          const cookieSources = cookieSourcesFromArgs(args, command.success.settings);
          const ffmpeg = yield* host.ffmpeg;
          if (ffmpeg === undefined || ffmpeg === "") {
            yield* finishOnce({
              ...identity,
              result: {
                type: "error",
                error: virtualError("binary-missing", Helpers.FFMPEG_NOT_FOUND_ERROR),
                exitCode: null,
              },
              closedAt: host.now(),
              stdoutTail: "",
              stderrTail: Helpers.FFMPEG_NOT_FOUND_ERROR,
            });
            return noop;
          }
          Helpers.insertFfmpegLocation({ args, ffmpegLocation: ffmpeg });
          const controller = yield* host.cancellation;
          const binary = yield* Effect.result(host.binary);
          if (Result.isFailure(binary)) {
            yield* preflightFailure(binary.failure.legacyMessage, "binary-missing", true);
            return noop;
          }
          const cancelRequest = Effect.fn("YtDlpExecutor.cancelRequest")(function* ({
            timeout,
            abortController,
          }: {
            readonly timeout: number | undefined;
            readonly abortController: boolean;
          }) {
            if (settled) return;
            cancelRequested = true;
            const grace = timeout ?? host.killGraceMs;
            if (abortController) yield* controller.abort;
            if (processRun !== undefined) yield* processRun.signalTree("SIGTERM").pipe(Effect.ignore);
            if (killTimer !== undefined) yield* Fiber.interrupt(killTimer);
            const kill = Effect.suspend(() =>
              processRun === undefined ? Effect.void : processRun.signalTree("SIGKILL").pipe(Effect.ignore)
            );
            if (grace > 0)
              killTimer = yield* Effect.forkIn(timing.sleep(grace).pipe(Effect.andThen(kill)), scope, {
                startImmediately: true,
              });
            else yield* kill;
          });
          const cancel = Effect.fn("YtDlpExecutor.cancel")((timeout?: number) =>
            cancelRequest({ timeout, abortController: true })
          );
          let nativeAbortRequested = false;
          const nativeAbort = Effect.fn("YtDlpExecutor.nativeAbort")(function* () {
            nativeAbortRequested = true;
            cancelRequested = true;
            if (processRun !== undefined) yield* processRun.signalChild("SIGTERM").pipe(Effect.ignore);
            yield* cancelRequest({ timeout: undefined, abortController: false });
          });
          const finishSuccessful = Effect.fn("YtDlpExecutor.finishSuccessful")(function* (closedAt: number) {
            const stdout = stdoutTail.read();
            const stderr = stderrTail.read();
            const filePath = filePathSeen ?? Helpers.extractSavedFilePath(`${stdout}\n${stderr}`) ?? "";
            let realSize = 0;
            if (filePath !== "" && (yield* files.exists(filePath)))
              realSize = yield* files.stat(filePath).pipe(
                Effect.map((value) => value.size),
                Effect.orElseSucceed(() => 0)
              );
            const output: TaskOutput = {
              filePath,
              size: realSize,
              durationMs: mediaDurationMs,
              sha256: null,
              formatId: formatIdSeen ?? Helpers.extractFormatId(stdout) ?? null,
            };
            const subtitleOutcome = Helpers.resolveSubtitleOutcome({
              downloadedLanguages: subtitleLanguages,
              fallbackAttempted: subtitleFallbackAttempted,
              initialStatus: initialSubtitleStatus,
              subtitlesRequested,
              unavailableSeen: subtitleUnavailableSeen,
            });
            if (cookieSources !== undefined) output.cookieSources = cookieSources;
            if (subtitleOutcome !== undefined) {
              output.subtitleStatus = subtitleOutcome.status;
              output.subtitleAcquisition = {
                id: ctx.attemptId,
                acquiredAt: closedAt,
                visibility: subtitleVisibility,
                credentialsUsed: A.contains(args, "--ignore-config")
                  ? A.some(args, (argument) =>
                      /^(?:--cookies|--cookies-from-browser|--username|--password|--netrc|--netrc-location|--netrc-cmd|--add-header)(?:=|$)/.test(
                        argument
                      )
                    )
                  : undefined,
              };
              if (subtitleOutcome.languages !== undefined) output.subtitleLanguages = subtitleOutcome.languages;
            }
            if (cancelRequested) {
              yield* finishOnce({
                ...identity,
                result: { type: "cancelled" },
                closedAt,
                stdoutTail: stdout,
                stderrTail: stderr,
              });
              return;
            }
            yield* finishOnce({
              ...identity,
              result: { type: "success", output },
              closedAt,
              stdoutTail: stdout,
              stderrTail: stderr,
            });
          });
          let currentAttempt = 0;
          const spawn = Effect.fn("YtDlpExecutor.spawn")(function* (
            processArgs: string[],
            notify: boolean
          ): Effect.fn.Return<void> {
            const attempt = ++currentAttempt;
            let processStderr = "";
            const emit = Effect.fn("YtDlpExecutor.wrapperObservation")(function* (event: WrapperObservation) {
              if (attempt !== currentAttempt) return;
              if (event._tag === "stdout" || event._tag === "stderr") {
                const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
                if (event._tag === "stdout") {
                  stdoutTail.append(text);
                  yield* capture(text, "stdout");
                  formatIdSeen = Helpers.extractFormatId(text) ?? formatIdSeen;
                } else {
                  processStderr = Str.slice(-Helpers.STDERR_TAIL_BYTES)(`${processStderr}${text}`);
                  stderrTail.append(text);
                  yield* capture(text, "stderr");
                }
                yield* sink.emit({
                  type: "std",
                  ...identity,
                  stream: event._tag,
                  line: Str.replace(/\r?\n$/, "")(text),
                });
              } else if (event._tag === "progress") {
                const progress = progressAggregator.apply(event.payload);
                if (progress !== null)
                  yield* sink.emit({ type: "progress", ...identity, progress, enteredProcessing: postprocessSeen });
              } else if (event._tag === "error") {
                const message = event.error instanceof Error ? event.error.message : String(event.error);
                yield* finishError(message, false);
              } else if (event._tag === "close") {
                if (settled) return;
                const closedAt = host.now();
                const stdout = stdoutTail.read();
                const stderr = stderrTail.read();
                if (cancelRequested) {
                  yield* finishOnce({
                    ...identity,
                    result: { type: "cancelled" },
                    closedAt,
                    stdoutTail: stdout,
                    stderrTail: stderr,
                  });
                  return;
                }
                if (event.code === 0) {
                  yield* finishSuccessful(closedAt);
                  return;
                }
                const savedPath = filePathSeen ?? Helpers.extractSavedFilePath(`${stdout}\n${stderr}`);
                const nonempty =
                  savedPath === undefined || savedPath === ""
                    ? false
                    : yield* files.stat(savedPath).pipe(
                        Effect.map((value) => value.size > 0),
                        Effect.orElseSucceed(() => false)
                      );
                if (nonempty && isUnsupportedThumbnailEmbedOnlyFailure(processStderr || stderr)) {
                  stderrTail.append(`\n${THUMBNAIL_EMBED_UNSUPPORTED_LOG}\n`);
                  yield* finishSuccessful(closedAt);
                  return;
                }
                if (
                  !subtitleFallbackAttempted &&
                  canRetryWithoutSubtitles &&
                  Helpers.hasSubtitleDownloadArgs(processArgs) &&
                  Helpers.SUBTITLE_DOWNLOAD_ERROR.test(processStderr)
                ) {
                  subtitleFallbackAttempted = true;
                  stderrTail.append(`${Helpers.SUBTITLE_FALLBACK_LOG}\n`);
                  yield* sink.emit({ type: "std", ...identity, stream: "stderr", line: Helpers.SUBTITLE_FALLBACK_LOG });
                  progressAggregator = new DownloadProgressAggregator();
                  postprocessSeen = false;
                  processingLines.stdout = "";
                  processingLines.stderr = "";
                  yield* spawn(Helpers.withoutSubtitleDownloadArgs(processArgs), false);
                  return;
                }
                yield* finishOnce({
                  ...identity,
                  result: {
                    type: "error",
                    error: Helpers.classifyYtDlpExit({
                      exitCode: event.code,
                      stderr: processStderr || stderr,
                      now: host.now(),
                    }),
                    exitCode: event.code,
                  },
                  closedAt,
                  stdoutTail: stdout,
                  stderrTail: stderr,
                });
              }
            });
            const started = yield* Effect.result(
              process.start(
                {
                  command: binary.success,
                  argv: processArgs,
                  env: undefined,
                  extendEnv: false,
                  cwd: undefined,
                  detached: host.platform !== "win32",
                  windowsHide: false,
                  stdin: "pipe",
                  stdout: "pipe",
                  stderr: "pipe",
                  abortSignal: controller.signal,
                },
                { emit, abort: nativeAbort() }
              )
            );
            if (Result.isFailure(started)) {
              yield* preflightFailure(started.failure.legacyMessage, "unknown", false);
              return;
            }
            if (started.success._tag === "NativeSpawnFailure") {
              yield* finishError(started.success.error.message, false);
              return;
            }
            processRun = started.success.run;
            yield* host.lowerPriority(processRun.pid);
            if (notify)
              yield* sink.emit({
                type: "spawn",
                ...identity,
                pid: processRun.pid ?? -1,
                pidStartedAt: null,
                kind: "yt-dlp",
                spawnedAt: host.now(),
              });
            if (cancelRequested) {
              if (nativeAbortRequested) yield* nativeAbort();
              else yield* cancel();
            }
          });
          yield* spawn(args, true);
          return { cancel, pause: cancel(host.killGraceMs) };
        });
        if (host.prepareSettings === undefined) {
          const result = yield* Effect.result(launch());
          if (Result.isSuccess(result)) return result.success;
          yield* finishError(result.failure.legacyMessage, false);
          return noop;
        }
        const prepared = host.prepareSettings(ctx.input).pipe(
          Effect.matchEffect({
            onFailure: (error) => preflightFailure(error.legacyMessage, "unknown", true),
            onSuccess: Effect.fn("YtDlpExecutor.prepared")(function* (settings) {
              launched = yield* launch(settings);
            }),
          })
        );
        yield* Effect.forkIn(prepared, scope, { startImmediately: true });
        return { cancel: pendingCancel, pause: pendingCancel(host.killGraceMs) };
      }),
    });
  })
);
