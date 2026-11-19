import { parseBrowserCookiesSetting } from "@vidbee/downloader-core/browser-cookies-setting";
import { getBrowserProfileCandidates } from "@vidbee/downloader-core/cookie-browser-paths";
import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import { sanitizePathSegment } from "@vidbee/downloader-core/output-path";
import { virtualError } from "@vidbee/task-queue/classifier";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import { HostFailure as QueueHostFailure } from "@vidbee/task-queue/TaskQueue.errors";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import * as Errors from "./Capture.errors.js";
import { CaptureProcessFailure, HostFailure } from "./Capture.errors.js";
import { CaptureExecutorOptions } from "./CaptureExecutor.service.js";
import { CaptureFiles } from "./CaptureFiles.service.js";
import { CaptureHost } from "./CaptureHost.service.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { readLocalStorageValue } from "./local-storage.js";
import { BrowserCallbacks } from "./Playwright.service.js";
import { decodeConsumedSidecarEvent, parseSidecarEvent } from "./protocol.js";
import { VIRTUAL_DISPLAY_SIZE } from "./quality.js";
import type { ProcessRun } from "@vidbee/downloader-core/DownloadProcess.service";
import type { ProcessEvent } from "@vidbee/downloader-core/Process.model";
import type { ExecutorFinishEvent } from "@vidbee/task-queue/Executor.model";
import type { StdStream, TaskOutput } from "@vidbee/task-queue/Task.model";
import type { ExecutorHandle } from "@vidbee/task-queue/TaskExecutor.service";
import type { CaptureError } from "./Capture.errors.js";

const Json = S.fromJsonString(S.Unknown);
const record = (value: unknown): Record<string, unknown> => (P.isObject(value) ? value : {});
const failure = (operation: string, cause: unknown): HostFailure =>
  HostFailure.make({
    operation,
    cause,
    legacyMessage: cause instanceof Error ? cause.message : String(cause),
  });
const queueFailure = (cause: CaptureError) =>
  QueueHostFailure.make({
    legacyMessage: cause.legacyMessage,
    original: cause,
  });
const messageOf = (error: unknown): string => {
  if (S.is(Errors.CaptureErrorSchema)(error)) return error.legacyMessage;
  return error instanceof Error ? error.message : String(error);
};
const tail = (limit: number) => {
  let value = "";
  return {
    append(text: string) {
      value += text;
      if (value.length > limit * 4) value = Str.slice(value.length - limit)(value);
    },
    read: () => (value.length > limit ? Str.slice(value.length - limit)(value) : value),
  };
};
const classify = (message: string) => {
  const text = Str.toLowerCase(message);
  if (Str.includes("xvfb")(text) || Str.includes("ffmpeg")(text) || Str.includes("browser found")(text))
    return virtualError("binary-missing", message);
  if (Str.includes("sign in")(text) || Str.includes("login")(text) || Str.includes("cookie")(text))
    return virtualError("auth-required", message);
  if (Str.includes("cancel")(text)) return virtualError("cancelled-by-user", message);
  return virtualError("unknown", message);
};
const fail = (legacyMessage: string) =>
  CaptureProcessFailure.make({
    operation: "capture executor",
    legacyMessage,
  });
export const BrowserCaptureExecutorLive = Layer.effect(
  TaskExecutor,
  Effect.gen(function* () {
    const host = yield* CaptureHost;
    const files = yield* CaptureFiles;
    const timers = yield* CaptureTimers;
    const timing = yield* LegacyTiming;
    const process = yield* DownloadProcess;
    const path = yield* Path.Path;
    const opts = yield* CaptureExecutorOptions;
    const callbacks = yield* BrowserCallbacks;
    const localStorageContext = yield* Effect.context<CaptureFiles | CaptureHost | Path.Path>();
    return TaskExecutor.of({
      run: Effect.fn("BrowserCaptureExecutor.run")(function* (ctx, sink) {
        const identity = {
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
        };
        const available = yield* host.available.pipe(Effect.mapError(queueFailure));
        if (!available) {
          const error = virtualError(
            "binary-missing",
            "In-browser capture needs Linux, Xvfb, and Chrome/Brave/Edge with Widevine."
          );
          yield* timers.defer(
            Effect.gen(function* () {
              const closedAt = yield* timers.now;
              yield* sink.emit({
                type: "finish",
                ...identity,
                result: {
                  type: "error",
                  error,
                  exitCode: null,
                },
                closedAt,
                stdoutTail: "",
                stderrTail: error.rawMessage,
              });
            })
          );
          return {
            cancel: () => Effect.void,
            pause: Effect.void,
          };
        }
        const controller = host.makeAbortController();
        let child: ProcessRun | undefined;
        let settled = false;
        const stdout = tail(8192);
        const stderr = tail(8192);
        const finish = Effect.fn("BrowserCaptureExecutor.finish")(function* (result: ExecutorFinishEvent["result"]) {
          if (settled) return;
          settled = true;
          const closedAt = yield* timers.now;
          yield* sink.emit({
            type: "finish",
            ...identity,
            result,
            closedAt,
            stdoutTail: stdout.read(),
            stderrTail: stderr.read(),
          });
        });
        const execute = Effect.fn("BrowserCaptureExecutor.execute")(function* () {
          const options = record(ctx.input.options);
          const settings = record(options.settings);
          const ffmpegPath = yield* opts.resolveFfmpegPath;
          const preference = settings.browserForCookies;
          const browserPreference = P.isTruthy(preference)
            ? yield* S.decodeUnknownEffect(S.String)(preference).pipe(
                Effect.mapError((cause) => failure("browser preference", cause))
              )
            : undefined;
          const browserExecutable = yield* host.browser(browserPreference);
          if (browserExecutable === null || !P.isTruthy(browserExecutable))
            return yield* fail("No Chromium-family browser found to play DRM media");
          // Typed caller defaults retain old truthiness. These fields originate in unported task options.
          const trimmed = (value: unknown) => {
            if (value === null || value === undefined) return undefined;
            if (typeof value !== "string") return Result.getOrThrow(S.decodeUnknownResult(S.String)(value));
            return Str.trim(value);
          };
          const defaultDirectory = opts.defaultDownloadDir;
          const directoryValue =
            trimmed(options.customDownloadPath) ||
            trimmed(settings.downloadPath) ||
            trimmed(options.downloadPath) ||
            defaultDirectory;
          const directory = yield* S.decodeEffect(S.String)(directoryValue).pipe(
            Effect.mapError((cause) => failure("output directory", cause))
          );
          yield* files.mkdir(directory, {
            recursive: true,
          });
          const titleValue = ctx.input.title || options.title || "video";
          const titleText = yield* S.decodeUnknownEffect(S.String)(
            typeof titleValue === "number" || typeof titleValue === "boolean" ? "" : titleValue
          ).pipe(Effect.mapError((cause) => failure("capture title", cause)));
          const title = sanitizePathSegment(titleText) || "video";
          const base = path.join(directory, `${title} (browser capture).mp4`);
          const exists = yield* files.stat(base).pipe(
            Effect.as(true),
            Effect.orElseSucceed(() => false)
          );
          const suffix = exists ? yield* timers.now : 0;
          const outputPath = exists ? path.join(directory, `${title} (browser capture) ${suffix}.mp4`) : base;
          const snapshot = yield* host.snapshot;
          const browser = parseBrowserCookiesSetting(browserPreference).browser;
          const names =
            P.isTruthy(browser) && browser !== "none"
              ? [browser]
              : ["brave", "chrome", "chromium", "edge", "vivaldi", "opera"];
          let token: string | null = null;
          for (const name of names) {
            for (const profile of getBrowserProfileCandidates(snapshot.platform, snapshot.home, name)) {
              token = yield* readLocalStorageValue(profile, "bcTokenSha").pipe(
                Effect.provideContext(localStorageContext)
              );
              if (token !== null && P.isTruthy(token)) break;
            }
            if (token !== null && P.isTruthy(token)) break;
          }
          const cookiePath = trimmed(settings.cookiesPath);
          const job = {
            url: ctx.input.url,
            outputPath,
            ffmpegPath,
            cookiesPath: P.isTruthy(cookiePath) ? cookiePath : undefined,
            browserExecutable,
            width: VIRTUAL_DISPLAY_SIZE.width,
            height: VIRTUAL_DISPLAY_SIZE.height,
            durationHintSec: typeof options.duration === "number" ? options.duration : undefined,
            localStorage:
              token !== null && P.isTruthy(token)
                ? {
                    bcTokenSha: token,
                  }
                : undefined,
          };
          const tmp = yield* files.tempDirectory(path.join(snapshot.temp, "vidbee-capture-"));
          const jobPath = path.join(tmp, "job.json");
          const text = yield* S.encodeUnknownEffect(Json)(job).pipe(
            Effect.mapError((cause) => failure("capture job write", cause))
          );
          yield* files.write(jobPath, `${text}\n`);
          const complete = yield* Deferred.make<number | null, CaptureError>();
          let ticks = 0;
          const result: {
            filePath?: string | undefined;
            durationMs?: number | null | undefined;
            error?: string | undefined;
            protocolError?: CaptureError | undefined;
          } = {};
          const handleLine = Effect.fn("BrowserCaptureExecutor.handleLine")(function* (
            stream: StdStream,
            line: string
          ) {
            (stream === "stdout" ? stdout : stderr).append(`${line}\n`);
            const raw = parseSidecarEvent(line);
            if (raw === null) {
              if (Str.trim(line).length > 0)
                yield* sink.emit({
                  type: "std",
                  ...identity,
                  stream,
                  line,
                });
              return;
            }
            const parsed = decodeConsumedSidecarEvent(raw);
            if (Result.isFailure(parsed)) {
              result.protocolError = parsed.failure;
              return;
            }
            const event = parsed.success;
            if (event === null) return;
            switch (event.type) {
              case "log":
                yield* sink.emit({
                  type: "std",
                  ...identity,
                  stream: "stdout",
                  line: event.message,
                });
                return;
              case "progress":
                ticks += 1;
                yield* sink.emit({
                  type: "progress",
                  ...identity,
                  enteredProcessing: event.percent > 0.95,
                  progress: {
                    percent: event.percent,
                    bytesDownloaded: null,
                    bytesTotal: null,
                    speedBps: null,
                    etaMs:
                      event.duration > event.currentTime
                        ? Math.round((event.duration - event.currentTime) * 1000)
                        : null,
                    ticks,
                  },
                });
                return;
              case "done":
                result.filePath = event.filePath;
                result.durationMs = event.durationMs;
                return;
              case "error":
                result.error = event.message;
                return;
            }
          });
          const emit = Effect.fn("BrowserCaptureExecutor.processEvent")(function* (event: ProcessEvent) {
            if (event._tag === "stdout" || event._tag === "stderr") {
              for (const line of Str.split(new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk), /\r?\n/))
                yield* handleLine(event._tag, line);
            } else if (event._tag === "rawError") yield* Deferred.fail(complete, failure("sidecar", event.error));
            else if (event._tag === "complete") {
              if (event.outcome._tag === "Raw") yield* Deferred.succeed(complete, event.outcome.code);
              else if (event.outcome.result._tag === "ExitCode")
                yield* Deferred.succeed(complete, event.outcome.result.code);
              else yield* Deferred.fail(complete, failure("sidecar", event.outcome.result.error));
            }
          });
          const start = yield* process
            .start(
              {
                command: opts.execPath ?? snapshot.execPath,
                argv: [...(opts.execArgv ?? []), yield* opts.resolveSidecarScript, "--job", jobPath],
                env: {
                  ...snapshot.environment,
                  ...opts.env,
                  ELECTRON_RUN_AS_NODE: "1",
                },
                extendEnv: false,
                cwd: undefined,
                detached: false,
                windowsHide: false,
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
                rawErrorObservation: "once",
                rawCloseObservation: "once",
                rawExitObservation: "omit",
                rawObservationStart: "on-demand",
              },
              {
                abort: Effect.void,
                emit,
              }
            )
            .pipe(Effect.mapError((error) => failure("spawn sidecar", error.cause)));
          if (start._tag === "NativeSpawnFailure") return yield* failure("spawn sidecar", start.error);
          child = start.run;
          if (child.pid === undefined || !P.isTruthy(child.pid))
            return yield* fail("Failed to spawn browser-capture sidecar");
          const spawnedAt = yield* timers.now;
          yield* sink.emit({
            type: "spawn",
            ...identity,
            pid: child.pid,
            pidStartedAt: null,
            kind: "ffmpeg",
            spawnedAt,
          });
          const ownedChild = child;
          // Register after onSpawn, preserving the original early-abort gap.
          controller.signal.addEventListener("abort", () =>
            callbacks.sync(ownedChild.signalTree("SIGTERM").pipe(Effect.ignore))
          );
          if (ownedChild.activateObservations !== undefined) yield* ownedChild.activateObservations;
          const code = yield* Deferred.await(complete);
          yield* timing.turn("capture.close.await");
          if (result.protocolError !== undefined) return yield* result.protocolError;
          if (P.isTruthy(result.error)) return yield* fail(result.error ?? "");
          if (controller.signal.aborted) return yield* fail("Capture cancelled");
          const filePath = result.filePath;
          if (filePath === undefined || !P.isTruthy(filePath) || code !== 0)
            return yield* fail(stderr.read() || `browser-capture sidecar exited ${code ?? -1}`);
          const info = yield* files.stat(filePath);
          const output: TaskOutput = {
            filePath,
            size: info.size,
            durationMs: result.durationMs ?? null,
            sha256: null,
            formatId: "browser-capture",
          };
          return output;
        });
        let thenStarted = false;
        yield* timers.defer(
          execute().pipe(
            Effect.flatMap((output) =>
              timing.turn("capture.execute.then").pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    thenStarted = true;
                  })
                ),
                Effect.andThen(
                  finish({
                    type: "success",
                    output,
                  })
                )
              )
            ),
            Effect.catchCause((cause) => {
              const error = cause.pipe(Cause.findErrorOption, Option.getOrUndefined) ?? Cause.squash(cause);
              const message = messageOf(error);
              const result: ExecutorFinishEvent["result"] = controller.signal.aborted
                ? {
                    type: "cancelled",
                  }
                : {
                    type: "error",
                    error: classify(message),
                    exitCode: 1,
                  };
              return (thenStarted ? Effect.void : timing.turn("capture.execute.reject.then")).pipe(
                Effect.andThen(timing.turn("capture.execute.catch")),
                Effect.andThen(finish(result))
              );
            })
          ),
          { rejectOnFailure: true }
        );
        const cancel = Effect.fn("BrowserCaptureExecutor.cancel")(function* (timeout?: number) {
          controller.abort();
          if (child !== undefined) yield* child.signalTree("SIGTERM").pipe(Effect.ignore);
          else if (opts.cancelBeforeSpawn !== undefined) yield* opts.cancelBeforeSpawn;
          yield* timers.sleep(Math.min(timeout ?? opts.killGraceMs ?? 10000, 2000));
          if (!settled && child !== undefined) yield* child.signalTree("SIGKILL").pipe(Effect.ignore);
        });
        const handle: ExecutorHandle = {
          cancel,
          pause: cancel(),
        };
        return handle;
      }),
    });
  })
);
