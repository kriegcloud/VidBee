import { virtualError } from "@vidbee/task-queue/classifier";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import { HostFailure as QueueHostFailure } from "@vidbee/task-queue/TaskQueue.errors";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { HostFailure, ProfileUnavailable } from "./Capture.errors.js";
import { CaptureFiles } from "./CaptureFiles.service.js";
import { CaptureHost } from "./CaptureHost.service.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { ProfileExecutorDependencies } from "./ProfileExecutor.service.js";
import type { SocialCollectionSummary, TaskOutput } from "@vidbee/task-queue/Task.model";
import type { CaptureError } from "./Capture.errors.js";

const Json = S.fromJsonString(S.Unknown);
const queueFailure = (cause: CaptureError) =>
  QueueHostFailure.make({ original: cause, legacyMessage: cause.legacyMessage });
const originalFailure = (cause: Cause.Cause<CaptureError>): unknown => {
  const found = Cause.findErrorOption(cause);
  if (Option.isNone(found)) return Cause.squash(cause);
  const error = found.value;
  if (S.is(HostFailure)(error) && "cause" in error) return error.cause;
  return new Error(error.legacyMessage);
};
const makeProfileExecutor = Effect.fn("makeProfileExecutor")(function* () {
  const dependencies = yield* ProfileExecutorDependencies;
  const host = yield* CaptureHost;
  const timers = yield* CaptureTimers;
  const files = yield* CaptureFiles;
  const path = yield* Path.Path;
  const timing = yield* LegacyTiming;
  return TaskExecutor.of({
    run: Effect.fn("OnlyFansBrowserExecutor.run")(function* (ctx, sink) {
      if (!(yield* dependencies.matches(ctx.input.url).pipe(Effect.mapError(queueFailure))))
        return yield* dependencies.fallback.run(ctx, sink);
      const controller = host.makeAbortController();
      const identity = { taskId: ctx.taskId, attemptId: ctx.attemptId };
      const body = Effect.fn("OnlyFansBrowserExecutor.body")(function* () {
        const options = ctx.input.options;
        if (typeof options?.onlyFansProfile !== "string" || typeof options.onlyFansMediaId !== "string")
          return yield* ProfileUnavailable.make({
            operation: "profile executor",
            legacyMessage: `Open this ${dependencies.name()} profile in VidBeep and map it using the dedicated browser session.`,
          });
        const destination =
          typeof options.customDownloadPath === "string"
            ? options.customDownloadPath
            : yield* dependencies.defaultDirectory;
        const output = yield* dependencies.download(
          options.onlyFansProfile,
          options.onlyFansMediaId,
          destination,
          controller.signal,
          {
            emit: Effect.fn("OnlyFansBrowserExecutor.progress")(function* (bytes, total) {
              const ticks = yield* timers.now;
              const hasTotal = Boolean(total);
              yield* sink.emit({
                type: "progress",
                ...identity,
                enteredProcessing: false,
                progress: {
                  percent: hasTotal ? bytes / total : null,
                  bytesDownloaded: bytes,
                  bytesTotal: hasTotal ? total : null,
                  speedBps: null,
                  etaMs: null,
                  ticks,
                },
              });
            }),
          }
        );
        const completed: TaskOutput = { ...output, durationMs: null, sha256: null };
        if (ctx.input.kind === "social-media") {
          const manifestPath = `${output.filePath}.manifest.json`;
          const startedAt = yield* timers.now;
          const finishedAt = yield* timers.now;
          const summary: SocialCollectionSummary = {
            posts: 1,
            images: 1,
            videos: 0,
            downloaded: 1,
            existing: 0,
            failed: 0,
            totalSize: output.size,
            reason: "exhausted",
            manifestPath,
            startedAt,
            finishedAt,
          };
          const text = yield* S.encodeUnknownEffect(Json)({ files: [output.filePath], ...summary }).pipe(
            Effect.mapError((cause) =>
              HostFailure.make({ operation: "profile manifest", cause, legacyMessage: String(cause) })
            )
          );
          yield* files.write(manifestPath, text, { mode: 0o600, sync: true });
          completed.outputDirectory = path.dirname(output.filePath);
          completed.fileCount = 1;
          completed.collectionSummary = summary;
        }
        const closedAt = yield* timers.now;
        yield* sink.emit({
          type: "finish",
          ...identity,
          closedAt,
          stdoutTail: "",
          stderrTail: "",
          result: { type: "success", output: completed },
        });
      });
      const execute = Effect.fn("OnlyFansBrowserExecutor.execute")(function* () {
        yield* timing.turn("profileExecutor.initial");
        const snapshot = yield* host.snapshot;
        const pidStartedAt = yield* timers.now;
        const spawnedAt = yield* timers.now;
        // Spawn stays outside the legacy catch, including callback defects.
        yield* sink.emit({ type: "spawn", ...identity, pid: snapshot.pid, pidStartedAt, kind: "ai-worker", spawnedAt });
        yield* body().pipe(
          Effect.catchCause(
            Effect.fnUntraced(function* (cause) {
              const error = originalFailure(cause);
              const message = error instanceof Error ? error.message : `${dependencies.name()} download failed.`;
              const closedAt = yield* timers.now;
              yield* sink.emit({
                type: "finish",
                ...identity,
                closedAt,
                stdoutTail: "",
                stderrTail: "",
                result: controller.signal.aborted
                  ? { type: "cancelled" }
                  : { type: "error", error: virtualError("auth-required", message), exitCode: null },
              });
            })
          )
        );
      });
      const done = yield* dependencies.attempt(execute());
      const cancel = Effect.fn("OnlyFansBrowserExecutor.cancel")(function* () {
        controller.abort();
        yield* done.wait.pipe(Effect.mapError(queueFailure));
      });
      return { cancel, pause: cancel() };
    }),
  });
});
export const ProfileExecutorLive = Layer.effect(TaskExecutor)(makeProfileExecutor());
