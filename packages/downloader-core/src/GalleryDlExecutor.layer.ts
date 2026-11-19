import { classifyWithDateParser, virtualError } from "@vidbee/task-queue/classifier";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { DownloadProcess } from "./DownloadProcess.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { galleryWaitDurationMs } from "./GalleryDlExecutor.helpers.js";
import { GalleryDlExecutorHost } from "./GalleryDlExecutorHost.service.js";
import { CollectionSummary } from "./schemas.js";
import { readSocialAsset, selectPrimarySocialFile } from "./social-media.js";
import { createTailBuffer } from "./YtDlpExecutor.helpers.js";
import type { ExecutorFinishEvent } from "@vidbee/task-queue/Executor.model";
import type { SocialCollectionSummary, TaskOutput } from "@vidbee/task-queue/Task.model";
import type { GalleryOutputFailureKind, TerminationSignal } from "./DownloadLiterals.model.js";
import type { ProcessRun } from "./DownloadProcess.service.js";
import type { SocialAssetFile } from "./social-media.js";

const Json = S.fromJsonString(S.Unknown);
const noop = { cancel: Effect.fn("GalleryDlExecutor.noopCancel")(() => Effect.void), pause: Effect.void };
export const layer = Layer.effect(
  TaskExecutor,
  Effect.gen(function* () {
    const host = yield* GalleryDlExecutorHost;
    const process = yield* DownloadProcess;
    const timing = yield* DownloadTiming;
    const scope = yield* Effect.scope;
    return TaskExecutor.of({
      run: Effect.fn("GalleryDlExecutor.run")(function* (ctx, sink) {
        const command = yield* host.command(ctx);
        const identity = { taskId: ctx.taskId, attemptId: ctx.attemptId };
        const stdoutTail = createTailBuffer(8192);
        const stderrTail = createTailBuffer(8192);
        let materializedFiles = HashSet.empty<string>();
        const materializedPaths: string[] = [];
        let settled = false;
        let cancelRequested = false;
        let killTimer: Fiber.Fiber<void> | undefined;
        let stdoutCarry = "";
        let stderrCarry = "";
        let discoveredCount = 0;
        let downloadedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        let ticks = 0;
        let socialSummary: SocialCollectionSummary | undefined;
        let socialComplete = false;
        const socialAssets: SocialAssetFile[] = [];
        let protocolError = false;
        let processRun: ProcessRun | undefined;
        const finishOnce = Effect.fn("GalleryDlExecutor.finishOnce")(function* (event: ExecutorFinishEvent) {
          if (settled) return;
          settled = true;
          if (killTimer !== undefined) {
            yield* Fiber.interrupt(killTimer);
            killTimer = undefined;
          }
          yield* sink.emit({ type: "finish", ...event });
        });
        if (command.unsupported) {
          yield* finishOnce({
            ...identity,
            result: {
              type: "error",
              error: virtualError("unknown", "Unsupported social media collection URL."),
              exitCode: null,
            },
            closedAt: host.now(),
            stdoutTail: "",
            stderrTail: "",
          });
          return noop;
        }
        const binary = yield* Effect.result(host.binary);
        if (Result.isFailure(binary)) {
          yield* finishOnce({
            ...identity,
            result: {
              type: "error",
              error: virtualError("binary-missing", binary.failure.legacyMessage),
              exitCode: null,
            },
            closedAt: host.now(),
            stdoutTail: "",
            stderrTail: binary.failure.legacyMessage,
          });
          return noop;
        }
        const processStdoutLine = Effect.fn("GalleryDlExecutor.stdoutLine")(function* (rawLine: string) {
          const line = Str.trimEnd(rawLine);
          if (line === "") return;
          yield* sink.emit({ type: "std", ...identity, stream: "stdout", line });
          if (command.social) {
            if (!Str.startsWith("__VIDBEE_SOCIAL__\t")(line)) return;
            const parseSocial = Effect.fnUntraced(function* () {
              const decoded = S.decodeOption(Json)(Str.slice("__VIDBEE_SOCIAL__\t".length)(line));
              if (Option.isNone(decoded)) {
                protocolError = true;
                return;
              }
              const value = decoded.value;
              if (value !== null && typeof value === "object" && "type" in value && value.type === "item") return;
              if (value !== null && typeof value === "object" && "type" in value && value.type === "asset") {
                const asset = readSocialAsset(value);
                if (asset !== null && !A.some(socialAssets, (known) => known.path === asset.path))
                  socialAssets.push(asset);
                return;
              }
              if (
                value === null ||
                typeof value !== "object" ||
                !("type" in value) ||
                !("summary" in value) ||
                (value.type !== "progress" && value.type !== "complete")
              ) {
                protocolError = true;
                return;
              }
              const summary = S.decodeUnknownOption(CollectionSummary)(value.summary);
              if (Option.isNone(summary)) {
                protocolError = true;
                return;
              }
              socialSummary = summary.value;
              socialComplete = value.type === "complete";
              ticks++;
              yield* sink.emit({
                type: "progress",
                ...identity,
                enteredProcessing: false,
                progress: {
                  percent: null,
                  bytesDownloaded: summary.value.totalSize,
                  bytesTotal: null,
                  speedBps: null,
                  etaMs: null,
                  ticks,
                  collectionSummary: summary.value,
                },
              });
            });
            yield* parseSocial().pipe(
              Effect.catchCause(() =>
                Effect.sync(() => {
                  protocolError = true;
                })
              )
            );
            return;
          }
          if (!Str.startsWith("__VIDBEE_GDL__\t")(line)) return;
          const parts = Str.split("\t")(line);
          const eventName = parts[1];
          const normalizedPath = Str.trim(parts[2] ?? "");
          if (eventName === "prepare") discoveredCount++;
          else if (eventName === "after") {
            downloadedCount++;
            if (normalizedPath !== "" && !HashSet.has(materializedFiles, normalizedPath)) {
              materializedFiles = HashSet.add(materializedFiles, normalizedPath);
              materializedPaths.push(normalizedPath);
            }
          } else if (eventName === "skip") {
            skippedCount++;
            if (normalizedPath !== "" && !HashSet.has(materializedFiles, normalizedPath)) {
              materializedFiles = HashSet.add(materializedFiles, normalizedPath);
              materializedPaths.push(normalizedPath);
            }
          } else if (eventName === "error") failedCount++;
          ticks++;
          const total = Math.max(command.expectedAssetCount, discoveredCount);
          yield* sink.emit({
            type: "progress",
            ...identity,
            enteredProcessing: false,
            progress: {
              percent:
                command.expectedAssetCount > 0
                  ? Math.min((downloadedCount + skippedCount + failedCount) / total, 0.99)
                  : null,
              bytesDownloaded: null,
              bytesTotal: null,
              speedBps: null,
              etaMs: null,
              ticks,
            },
          });
        });
        const finalize = Effect.fn("GalleryDlExecutor.finalize")(function* (exitCode: number | null) {
          if (settled) return;
          if (Str.trim(stdoutCarry) !== "") yield* processStdoutLine(stdoutCarry);
          const closedAt = host.now();
          const stdout = stdoutTail.read();
          const stderr = stderrTail.read();
          const cancelled = Effect.suspend(() =>
            finishOnce({ ...identity, result: { type: "cancelled" }, closedAt, stdoutTail: stdout, stderrTail: stderr })
          );
          const failed = (message: string, category: typeof GalleryOutputFailureKind.Type, useStderr: boolean) =>
            finishOnce({
              ...identity,
              result: { type: "error", error: virtualError(category, message), exitCode },
              closedAt,
              stdoutTail: stdout,
              stderrTail: useStderr && stderr !== "" ? stderr : message,
            });
          if (cancelRequested) {
            yield* cancelled;
            return;
          }
          if (command.social && exitCode === 0) {
            const summary = socialSummary;
            const manifest = yield* host.socialManifest(command.configuredOutputDirectory);
            const verified =
              summary !== undefined &&
              socialComplete &&
              !protocolError &&
              summary.reason !== "incomplete" &&
              summary.failed === 0 &&
              summary.manifestPath === manifest.manifest &&
              manifest.isFile;
            if (cancelRequested) {
              yield* cancelled;
              return;
            }
            if (!verified || summary === undefined) {
              yield* failed(
                "Collection incomplete: missing traversal result or unverified media. Successfully saved files are retained.",
                "output-missing",
                false
              );
              return;
            }
            if (
              ctx.input.options?.socialInspect !== true &&
              (summary.totalSize <= 0 || summary.downloaded + summary.existing === 0)
            ) {
              yield* failed(
                "Collection contained no downloadable media. Check the selected category and authentication.",
                "output-missing",
                true
              );
              return;
            }
            yield* finishOnce({
              ...identity,
              result: {
                type: "success",
                output: {
                  filePath: selectPrimarySocialFile(socialAssets) ?? manifest.manifest,
                  size: summary.totalSize,
                  durationMs: null,
                  sha256: null,
                  outputDirectory: manifest.directory,
                  fileCount: summary.downloaded + summary.existing,
                  downloadedCount: summary.downloaded,
                  skippedCount: summary.existing,
                  failedCount: 0,
                  totalSize: summary.totalSize,
                  collectionSummary: summary,
                },
              },
              closedAt,
              stdoutTail: stdout,
              stderrTail: stderr,
            });
            return;
          }
          if (exitCode === 0) {
            const completed = downloadedCount + skippedCount;
            const missing = Math.max(
              Math.max(discoveredCount, command.expectedAssetCount) - completed - failedCount,
              0
            );
            const nonUnique = Math.max(completed - HashSet.size(materializedFiles), 0);
            if (failedCount > 0 || missing > 0 || nonUnique > 0) {
              yield* failed(
                `Gallery incomplete: ${failedCount} failed, ${missing} unfinished, and ${nonUnique} non-unique assets.`,
                "unknown",
                true
              );
              return;
            }
            const paths = [...materializedPaths];
            const firstFile = paths[0] ?? "";
            const inspected = yield* host.inspect(paths);
            if (cancelRequested) {
              yield* cancelled;
              return;
            }
            if (paths.length === 0 || inspected.invalidCount > 0) {
              yield* failed(
                `Gallery output missing or empty: ${inspected.invalidCount} invalid files among ${paths.length} reported outputs.`,
                "output-missing",
                true
              );
              return;
            }
            const output: TaskOutput = {
              filePath: firstFile || command.outputDirectory,
              size: command.profileCategory ? inspected.totalSize : inspected.firstFileSize,
              durationMs: null,
              sha256: null,
              formatId: null,
              outputDirectory: command.profileCategory ? command.outputDirectory : undefined,
              fileCount: command.profileCategory ? paths.length : undefined,
              downloadedCount: command.profileCategory ? downloadedCount : undefined,
              skippedCount: command.profileCategory ? skippedCount : undefined,
              failedCount: command.profileCategory ? failedCount : undefined,
              totalSize: command.profileCategory ? inspected.totalSize : undefined,
            };
            yield* finishOnce({
              ...identity,
              result: { type: "success", output },
              closedAt,
              stdoutTail: stdout,
              stderrTail: stderr,
            });
            return;
          }
          yield* finishOnce({
            ...identity,
            result: {
              type: "error",
              error: classifyWithDateParser(
                { stderr: stderr || `gallery-dl exited with code ${exitCode ?? -1}`, exitCode },
                host.now(),
                host.parseDate
              ),
              exitCode,
            },
            closedAt,
            stdoutTail: stdout,
            stderrTail: stderr,
          });
        });
        const processError = Effect.fn("GalleryDlExecutor.processError")(function* (message: string) {
          yield* finishOnce({
            ...identity,
            result: cancelRequested
              ? { type: "cancelled" }
              : {
                  type: "error",
                  error: classifyWithDateParser({ stderr: message, exitCode: null }, host.now(), host.parseDate),
                  exitCode: null,
                },
            closedAt: host.now(),
            stdoutTail: stdoutTail.read(),
            stderrTail: stderrTail.read(),
          });
        });
        const request = (signal: typeof TerminationSignal.Type) =>
          processRun === undefined
            ? Effect.void
            : (host.platform() === "win32" ? processRun.signalTree(signal) : processRun.signalGroup(signal)).pipe(
                Effect.ignore
              );
        const cancel = Effect.fn("GalleryDlExecutor.cancel")(function* (timeout?: number) {
          if (settled) return;
          cancelRequested = true;
          yield* request("SIGTERM");
          if (killTimer !== undefined) yield* Fiber.interrupt(killTimer);
          const grace = timeout ?? host.killGraceMs;
          if (grace <= 0) yield* request("SIGKILL");
          else
            killTimer = yield* Effect.forkIn(
              timing.sleep(grace).pipe(Effect.andThen(Effect.suspend(() => request("SIGKILL")))),
              scope,
              { startImmediately: true }
            );
        });
        const spec = yield* host.spec(binary.success, command.args);
        const started = yield* Effect.result(
          process.start(spec, {
            abort: cancel(),
            emit: Effect.fn("GalleryDlExecutor.processEvent")(function* (event) {
              if (event._tag === "stdout" || event._tag === "stderr") {
                const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
                if (event._tag === "stdout") {
                  stdoutTail.append(text);
                  stdoutCarry += text;
                  if (stdoutCarry.length > 1048576) {
                    protocolError = true;
                    stdoutCarry = Str.slice(-1048576)(stdoutCarry);
                  }
                  const lines = Str.split(/\r?\n/)(stdoutCarry);
                  stdoutCarry = lines.pop() ?? "";
                  yield* Effect.forEach(lines, processStdoutLine, { concurrency: 1, discard: true });
                } else {
                  stderrTail.append(text);
                  stderrCarry += text;
                  if (stderrCarry.length > 1048576) stderrCarry = Str.slice(-1048576)(stderrCarry);
                  const lines = Str.split(/\r?\n/)(stderrCarry);
                  stderrCarry = lines.pop() ?? "";
                  yield* Effect.forEach(
                    lines,
                    Effect.fnUntraced(function* (rawLine) {
                      const line = Str.trimEnd(rawLine);
                      if (line === "") return;
                      yield* sink.emit({
                        type: "std",
                        ...identity,
                        stream: "stderr",
                        line,
                        expectedSilenceMs: galleryWaitDurationMs(line),
                      });
                    }),
                    { concurrency: 1, discard: true }
                  );
                }
              } else if (event._tag === "rawError")
                yield* processError(event.error instanceof Error ? event.error.message : String(event.error));
              else if (event._tag === "complete") {
                const outcome = event.outcome;
                if (outcome._tag === "Native" && outcome.result._tag === "Failure") {
                  yield* processError(outcome.result.error.message);
                  return;
                }
                const code =
                  outcome._tag === "Raw"
                    ? outcome.code
                    : outcome.result._tag === "ExitCode"
                      ? outcome.result.code
                      : null;
                const finalized = finalize(code).pipe(
                  Effect.catchCause((cause) => {
                    const failure = Cause.findErrorOption(cause);
                    const original = Option.isSome(failure) ? failure.value : Cause.squash(cause);
                    const message =
                      original !== null &&
                      typeof original === "object" &&
                      "legacyMessage" in original &&
                      typeof original.legacyMessage === "string"
                        ? original.legacyMessage
                        : original instanceof Error
                          ? original.message
                          : String(original);
                    return finishOnce({
                      ...identity,
                      result: { type: "error", error: virtualError("unknown", message), exitCode: code },
                      closedAt: host.now(),
                      stdoutTail: stdoutTail.read(),
                      stderrTail: message,
                    });
                  })
                );
                yield* Effect.forkIn(finalized, scope, { startImmediately: true });
              }
            }),
          })
        );
        if (Result.isFailure(started)) {
          const message = started.failure.legacyMessage;
          yield* finishOnce({
            ...identity,
            result: {
              type: "error",
              error: classifyWithDateParser({ stderr: message, exitCode: null }, host.now(), host.parseDate),
              exitCode: null,
            },
            closedAt: host.now(),
            stdoutTail: "",
            stderrTail: message,
          });
          return noop;
        }
        if (started.success._tag === "NativeSpawnFailure") {
          yield* processError(started.success.error.message);
          return noop;
        }
        processRun = started.success.run;
        yield* sink.emit({
          type: "spawn",
          ...identity,
          pid: processRun.pid ?? -1,
          pidStartedAt: null,
          kind: "gallery-dl",
          spawnedAt: host.now(),
        });
        if (cancelRequested) yield* cancel();
        return { cancel, pause: cancel(host.killGraceMs) };
      }),
    });
  })
);
