import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as Result from "effect/Result";
import * as Str from "effect/String";
import { defaultMaxAttempts, virtualError } from "./classifier/index.js";
import { downloadIdentity } from "./download-identity.js";
import { transition } from "./fsm/index.js";
import { LegacyTiming } from "./LegacyTiming.service.js";
import { OutputProbe } from "./OutputProbe.service.js";
import { ProcessControl } from "./ProcessControl.service.js";
import * as Registry from "./process/ProcessRegistry.layer.js";
import { ProcessRegistry } from "./process/ProcessRegistry.service.js";
import * as Watchdog from "./process/Watchdog.layer.js";
import { Watchdog as WatchdogService } from "./process/Watchdog.service.js";
import { QueueRandom } from "./QueueRandom.service.js";
import { QueueTimers } from "./QueueTimers.service.js";
import { RegistryInspection } from "./RegistryInspection.service.js";
import * as Retry from "./scheduler/RetryScheduler.layer.js";
import { RetryScheduler } from "./scheduler/RetryScheduler.service.js";
import * as Scheduler from "./scheduler/Scheduler.layer.js";
import { Scheduler as SchedulerService } from "./scheduler/Scheduler.service.js";
import { TaskEvents } from "./TaskEvents.service.js";
import { TaskExecutor } from "./TaskExecutor.service.js";
import { TaskPersistence } from "./TaskPersistence.service.js";
import * as Errors from "./TaskQueue.errors.js";
import { TaskQueue, TaskQueueHooks } from "./TaskQueue.service.js";
import { TaskStore } from "./TaskStore.service.js";
import { EMPTY_PROGRESS, PRIORITY_USER, TERMINAL_STATUSES, TRANSCRIPTION_GROUP_KEY } from "./types.js";
import { hashRawArgs } from "./util/sha256.js";
import type { TransitionContext } from "./Classifier.model.js";
import type { ExecutorFinishEvent } from "./Executor.model.js";
import type { Cancel } from "./QueueTimers.service.js";
import type * as T from "./Task.model.js";
import type { ExecutorEvent, ExecutorHandle } from "./TaskExecutor.service.js";
import type * as Requests from "./TaskQueue.model.js";
import type { QueueError } from "./TaskQueue.service.js";

interface ActiveRun {
  readonly attemptId: string;
  readonly markStalled: (error: T.ClassifiedError) => void;
  readonly run: ExecutorHandle;
  readonly taskId: string;
}
export interface TaskQueueOptions {
  readonly defaultMaxPerGroup?: number | null;
  readonly idleQueueKickMs?: number;
  readonly maxConcurrency?: number;
  readonly processingIdleMs?: number;
  readonly runningIdleMs?: number;
  readonly sourceAdmission?: boolean;
  readonly zombieRunningMs?: number;
}
export const make = Effect.fnUntraced(function* (options: TaskQueueOptions = {}) {
  const store = yield* TaskStore;
  const bus = yield* TaskEvents;
  const persist = yield* TaskPersistence;
  const executor = yield* TaskExecutor;
  const timers = yield* QueueTimers;
  const random = yield* QueueRandom;
  const probe = yield* OutputProbe;
  const control = yield* ProcessControl;
  const timing = yield* LegacyTiming;
  const scope = yield* Effect.scope;
  const scheduler = yield* SchedulerService;
  const retry = yield* RetryScheduler;
  const watchdog = yield* WatchdogService;
  const processes = yield* ProcessRegistry;
  const hooks = yield* TaskQueueHooks;
  const active = MutableHashMap.empty<string, ActiveRun>();
  const starting = MutableHashMap.empty<string, { suspended: boolean }>();
  const finished = MutableHashMap.empty<string, Deferred.Deferred<void>>();
  const pendingAdmissions = MutableHashMap.empty<string, Deferred.Deferred<void, QueueError>>();
  const progressLastWrite = MutableHashMap.empty<string, number>();
  const progressDirty = MutableHashMap.empty<string, T.TaskProgress>();
  const pendingPause = MutableHashMap.empty<string, string>();
  const pendingCancel = MutableHashSet.empty<string>();
  const removing = MutableHashSet.empty<string>();
  const inspection = yield* Effect.serviceOption(RegistryInspection);
  if (Option.isSome(inspection))
    inspection.value.register("queue", () => ({
      active: MutableHashMap.size(active),
      finished: MutableHashMap.size(finished),
      starting: MutableHashMap.size(starting),
      pendingAdmissions: MutableHashMap.size(pendingAdmissions),
      pendingPause: MutableHashMap.size(pendingPause),
      pendingCancel: MutableHashSet.size(pendingCancel),
      removing: MutableHashSet.size(removing),
      progressDirty: MutableHashMap.size(progressDirty),
      progressLastWrite: MutableHashMap.size(progressLastWrite),
    }));
  let started = false;
  let stopping = 0;
  let reconcileBusy = false;
  let idleTimer: Cancel | null = null;
  const idleMs = options.idleQueueKickMs ?? 15000;
  const zombieMs = options.zombieRunningMs ?? 8000;
  const lookup = <K, V>(map: MutableHashMap.MutableHashMap<K, V>, key: K) =>
    Option.getOrUndefined(MutableHashMap.get(map, key));
  const detach = <E>(effect: Effect.Effect<void, E>) =>
    effect.pipe(
      Effect.catchCause((cause) => Effect.logError(cause)),
      Effect.forkIn(scope, { startImmediately: true }),
      Effect.asVoid
    );
  const outputComplete = Effect.fnUntraced(function* (kind: T.TaskKind, out: T.TaskOutput): Effect.fn.Return<boolean> {
    if (kind === "social-media")
      return (
        P.isTruthy(out.collectionSummary) &&
        out.collectionSummary !== undefined &&
        out.collectionSummary.reason !== "incomplete" &&
        out.collectionSummary.failed === 0 &&
        P.isTruthy(out.outputDirectory) &&
        (yield* probe.filePresent(out.outputDirectory ?? "")) &&
        (yield* probe.filePresent(out.collectionSummary.manifestPath))
      );
    if (
      A.contains(
        [
          "instagram-profile-category",
          "pinterest-gallery",
          "vsco-gallery",
          "facebook-gallery",
          "tiktok-photo",
          "threads-post",
          "threads-profile",
          "snapchat-media",
        ],
        kind
      )
    )
      return (
        P.isTruthy(out.outputDirectory) &&
        out.fileCount !== undefined &&
        out.fileCount > 0 &&
        out.size > 0 &&
        (out.failedCount ?? 0) === 0 &&
        (yield* probe.filePresent(out.outputDirectory ?? ""))
      );
    if (kind === "transcription")
      return (
        P.isTruthy(out.transcript?.transcriptId) &&
        (out.transcript?.resultKind === "transcript" || out.transcript?.resultKind === "no-speech")
      );
    if (
      kind === "subtitles" &&
      !(out.transcript?.resultKind === "transcript" && P.isTruthy(out.transcript.transcriptId))
    )
      return false;
    return P.isTruthy(out.filePath) && out.size > 0 && (yield* probe.filePresent(out.filePath));
  });
  const applyTransition = Effect.fnUntraced(function* (
    id: string,
    to: T.TaskStatus,
    ctx: Omit<TransitionContext, "now">,
    input?: T.TaskInput
  ): Effect.fn.Return<T.Task, QueueError> {
    const current = yield* store.get(id);
    if (current === undefined)
      return yield* Errors.StoreMissingTask.make({ legacyMessage: `applyTransition: missing task ${id}` });
    const now = yield* timers.now;
    const result = transition(current, to, { ...ctx, now });
    if (Result.isFailure(result)) {
      const error = result.failure;
      yield* persist.appendJournal({
        ts: yield* timers.now,
        op: "panic",
        taskId: id,
        attemptId: null,
        pid: current.pid ?? -1,
        pidStartedAt: current.pidStartedAt,
        exitCode: null,
        signal: error.legacyMessage,
      });
      if (current.status !== "completed" && current.status !== "cancelled") {
        const fallbackResult = transition(current, "failed", {
          trigger: "finalize-error",
          reason: "panic",
          error: virtualError("unknown", error.legacyMessage),
          now: yield* timers.now,
        });
        if (Result.isFailure(fallbackResult)) return yield* fallbackResult.failure;
        const fallback = fallbackResult.success;
        yield* store.update(fallback);
        yield* persist.upsertTask({ task: fallback, progress: fallback.progress });
        yield* bus.emit({
          type: "transition",
          taskId: id,
          from: current.status,
          to: "failed",
          reason: "panic",
          attempt: fallback.attempt,
          at: yield* timers.now,
        });
      }
      return yield* error;
    }
    const next = !P.isTruthy(input) || input === undefined ? result.success : { ...result.success, input };
    yield* Effect.gen(function* () {
      yield* store.update(next);
      yield* persist.upsertTask({ task: next, progress: next.progress });
    }).pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          if ((yield* store.get(id)) === next) yield* store.update(current).pipe(Effect.orDie);
        })
      )
    );
    yield* bus.emit({
      type: "transition",
      taskId: id,
      from: current.status,
      to: next.status,
      reason: next.statusReason,
      attempt: next.attempt,
      at: next.updatedAt,
    });
    yield* bus.emit({ type: "snapshot-changed", taskId: id, task: next, at: next.updatedAt });
    yield* timing.turn("transition.complete");
    return next;
  });
  const enterProcessing = Effect.fnUntraced(function* (id: string, attemptId: string): Effect.fn.Return<void> {
    if (lookup(active, id)?.attemptId !== attemptId || (yield* store.get(id))?.status !== "running") return;
    yield* detach(applyTransition(id, "processing", { trigger: "progressing", reason: null }).pipe(Effect.asVoid));
    yield* watchdog.promoteToProcessing(id);
  });
  const applyProgress = Effect.fnUntraced(function* (
    id: string,
    progress: T.TaskProgress
  ): Effect.fn.Return<void, QueueError> {
    const task = yield* store.get(id);
    if (task === undefined) return;
    const updatedAt = yield* timers.now;
    const merged = { ...task, progress, updatedAt };
    yield* store.update(merged);
    MutableHashMap.set(progressDirty, id, progress);
    yield* bus.emit({ type: "progress", taskId: id, progress, at: updatedAt });
    const last = lookup(progressLastWrite, id) ?? 0;
    if (updatedAt - last >= 1000) {
      MutableHashMap.set(progressLastWrite, id, updatedAt);
      yield* detach(persist.upsertProgress(id, progress));
      MutableHashMap.remove(progressDirty, id);
    }
  });
  const finishAttempt = Effect.fnUntraced(function* (
    id: string,
    attemptId: string,
    event: ExecutorFinishEvent
  ): Effect.fn.Return<void, QueueError> {
    const pauseReason = lookup(pendingPause, id);
    MutableHashMap.remove(pendingPause, id);
    const close = Effect.fnUntraced(function* (
      exitCode: number | null,
      errorCategory: T.ErrorCategory | null,
      signal: string | null
    ) {
      yield* persist.closeAttempt({
        taskId: id,
        attemptId,
        endedAt: event.closedAt,
        exitCode,
        errorCategory,
        stdoutTail: event.stdoutTail,
        stderrTail: event.stderrTail,
      });
      yield* processes.recordClose(id, attemptId, exitCode, signal);
    });
    if (event.result.type === "success") {
      const out = event.result.output;
      const current = yield* store.get(id);
      if (current?.status === "cancelled") {
        yield* close(0, null, null);
        return;
      }
      if (yield* outputComplete(current?.kind ?? "video", out)) {
        yield* close(0, null, null);
        if ((yield* store.get(id))?.status === "cancelled") return;
        yield* applyTransition(id, "completed", { trigger: "finalize-success", reason: null, output: out });
      } else {
        const error = virtualError("output-missing", `output ${out.filePath} missing or empty`);
        yield* close(null, "output-missing", null);
        if ((yield* store.get(id))?.status === "cancelled") return;
        yield* applyTransition(id, "failed", { trigger: "finalize-error", reason: "output-missing", error });
      }
      return;
    }
    if (event.result.type === "cancelled") {
      yield* close(null, "cancelled-by-user", "SIGTERM");
      const cancelRequested = MutableHashSet.has(pendingCancel, id);
      MutableHashSet.remove(pendingCancel, id);
      const task = yield* store.get(id);
      if (task !== undefined && (task.status === "running" || task.status === "processing"))
        yield* applyTransition(id, !cancelRequested && pauseReason !== undefined ? "paused" : "cancelled", {
          trigger: !cancelRequested && pauseReason !== undefined ? "pause" : "cancel",
          reason: !cancelRequested && pauseReason !== undefined ? pauseReason : "user",
        });
      return;
    }
    const error = event.result.error;
    const exitCode = event.result.exitCode ?? null;
    yield* close(exitCode, error.category, null);
    if ((yield* store.get(id))?.status === "cancelled") return;
    const task = yield* store.get(id);
    yield* bus.emit({
      type: "error-classified",
      taskId: id,
      attempt: task?.attempt ?? 0,
      error,
      at: yield* timers.now,
    });
    const max = Math.max(task?.maxAttempts ?? 0, defaultMaxAttempts(error.category));
    if (error.retryable && (task?.attempt ?? 0) < max) {
      const rng = error.suggestedRetryAfterMs !== null && error.suggestedRetryAfterMs >= 0 ? 0 : yield* random.next;
      const wait = Retry.computeBackoffMs(task?.attempt ?? 0, error.suggestedRetryAfterMs, () => rng);
      const nextRetryAt = (yield* timers.now) + wait;
      yield* applyTransition(id, "retry-scheduled", {
        trigger: "finalize-error",
        reason: error.category,
        error,
        nextRetryAt,
      });
      yield* retry.enqueue(id, nextRetryAt);
    } else yield* applyTransition(id, "failed", { trigger: "finalize-error", reason: error.category, error });
  });
  const handleFinish = Effect.fnUntraced(function* (
    id: string,
    attemptId: string,
    event: ExecutorFinishEvent
  ): Effect.fn.Return<void> {
    yield* Effect.gen(function* () {
      yield* watchdog.disarm(id);
      MutableHashMap.remove(active, id);
      yield* finishAttempt(id, attemptId, event).pipe(
        Effect.catchCause((cause) => Effect.logError("task_queue_handle_finish_threw", cause))
      );
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          if (lookup(active, id)?.attemptId === attemptId) MutableHashMap.remove(active, id);
          return scheduler.releaseSlot(id);
        })
      )
    );
  });
  const dispatchOne = Effect.fnUntraced(function* (id: string): Effect.fn.Return<boolean, QueueError> {
    const task = yield* store.get(id);
    if (task?.status !== "queued") return false;
    const attemptId = yield* random.uuid;
    const admitted = yield* applyTransition(id, "running", { trigger: "dispatch", reason: null }).pipe(Effect.result);
    if (Result.isFailure(admitted)) {
      if (admitted.failure._tag === "IllegalTransition") return false;
      return yield* admitted.failure;
    }
    yield* persist.insertAttempt({
      taskId: id,
      attemptId,
      pid: -1,
      pidStartedAt: null,
      startedAt: yield* timers.now,
      rawArgsHash: hashRawArgs(task.input.rawArgs),
    });
    let accepting = true;
    let stalled: T.ClassifiedError | undefined;
    const completion = yield* Deferred.make<void>();
    MutableHashMap.set(finished, id, completion);
    const complete = Effect.gen(function* () {
      if (lookup(finished, id) === completion) {
        MutableHashMap.remove(finished, id);
        MutableHashMap.remove(starting, id);
        MutableHashMap.remove(pendingPause, id);
        MutableHashSet.remove(pendingCancel, id);
        MutableHashMap.remove(progressLastWrite, id);
        MutableHashMap.remove(progressDirty, id);
      }
      yield* Deferred.succeed(completion, undefined);
    });
    const emit = Effect.fnUntraced(function* (event: ExecutorEvent): Effect.fn.Return<void> {
      if (!accepting) return;
      if (event.type === "finish") {
        accepting = false;
        const next =
          MutableHashMap.has(pendingPause, id) || MutableHashSet.has(pendingCancel, id)
            ? { ...event, result: { type: "cancelled" as const } }
            : stalled === undefined
              ? event
              : { ...event, result: { type: "error" as const, error: stalled, exitCode: null } };
        yield* detach(handleFinish(id, attemptId, next).pipe(Effect.ensuring(complete)));
        return;
      }
      if (event.type === "spawn") {
        const pidStartedAt = event.pidStartedAt ?? (yield* control.startTime(event.pid));
        yield* detach(
          processes.recordSpawn({
            taskId: id,
            attemptId,
            pid: event.pid,
            pidStartedAt,
            kind: event.kind,
            spawnedAt: event.spawnedAt,
          })
        );
        const current = yield* store.get(id);
        if (current === undefined || HashSet.has(TERMINAL_STATUSES, current.status)) return;
        const spawned = { ...current, pid: event.pid, pidStartedAt };
        yield* store.update(spawned).pipe(Effect.orDie);
        yield* detach(persist.upsertTask({ task: spawned, progress: spawned.progress }));
        yield* watchdog.arm(id, "running");
        return;
      }
      if (event.type === "progress") {
        const current = yield* store.get(id);
        if (current === undefined || HashSet.has(TERMINAL_STATUSES, current.status)) return;
        yield* applyProgress(id, event.progress).pipe(Effect.orDie);
        yield* watchdog.bump(id);
        if (event.enteredProcessing) yield* enterProcessing(id, attemptId);
        return;
      }
      if (event.type === "processing") {
        yield* enterProcessing(id, attemptId);
        return;
      }
      yield* watchdog.bump(id, event.expectedSilenceMs);
      if (event.line === "worker-alive") return;
      yield* bus.emit({
        type: "log",
        taskId: id,
        attemptId,
        stream: event.stream,
        line: event.line,
        at: yield* timers.now,
      });
    });
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const start = { suspended: false };
        MutableHashMap.set(starting, id, start);
        // Immediate execution distinguishes re-entrant controls in the synchronous prefix
        // from controls arriving after run has actually suspended, for every executor.
        const startFiber = yield* executor
          .run({ taskId: id, attemptId, attemptNumber: admitted.success.attempt, input: task.input }, { emit })
          .pipe(Effect.forkChild({ startImmediately: true }));
        start.suspended = startFiber.pollUnsafe() === undefined;
        const result = yield* restore(Fiber.join(startFiber)).pipe(
          Effect.result,
          Effect.onError(() =>
            Effect.sync(() => {
              accepting = false;
            }).pipe(Effect.andThen(complete))
          )
        );
        MutableHashMap.remove(starting, id);
        if (Result.isFailure(result)) {
          accepting = false;
          const error = virtualError("unknown", String(result.failure.original));
          yield* applyTransition(id, "failed", { trigger: "finalize-error", reason: error.category, error }).pipe(
            Effect.ensuring(scheduler.releaseSlot(id)),
            Effect.ensuring(complete)
          );
          return false;
        }
        if (accepting) {
          MutableHashMap.set(active, id, {
            taskId: id,
            attemptId,
            run: result.success,
            markStalled: (error) => {
              stalled = error;
            },
          });
          if (start.suspended && MutableHashSet.has(pendingCancel, id)) yield* detach(result.success.cancel());
          else if (start.suspended && MutableHashMap.has(pendingPause, id)) yield* detach(result.success.pause);
        }
        return true;
      })
    );
  });
  const demote = Effect.fnUntraced(function* (id: string): Effect.fn.Return<void> {
    const run = lookup(active, id);
    if (run === undefined) return;
    MutableHashMap.set(pendingPause, id, "demote");
    yield* run.run.pause.pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          MutableHashMap.remove(pendingPause, id);
          yield* Effect.logError("task_queue_demote_pause_threw", cause);
        })
      )
    );
  });
  const retryDue = Effect.fnUntraced(function* (id: string) {
    const task = yield* store.get(id);
    if (task?.status !== "retry-scheduled") return;
    const next = yield* applyTransition(id, "queued", { trigger: "retry-tick", reason: "retry" });
    yield* scheduler.enqueue(id, next.priority);
  });
  const stalled = Effect.fnUntraced(function* (
    id: string,
    entry: Readonly<import("./process/Watchdog.service.js").WatchdogEntry>
  ) {
    const run = lookup(active, id);
    const task = yield* store.get(id);
    if (run === undefined || task === undefined || HashSet.has(TERMINAL_STATUSES, task.status)) return;
    run.markStalled(
      virtualError(
        "stalled",
        `Watchdog: task idle exceeded (phase=${entry.status}, idleMs=${(yield* timers.now) - entry.lastBumpAt}, lastOutputAt=${entry.lastBumpAt})`
      )
    );
    yield* detach(run.run.cancel(0));
  });
  const findDuplicateDownload = Effect.fnUntraced(function* (
    input: T.TaskInput,
    parentId: string | null = null
  ): Effect.fn.Return<Readonly<T.Task> | undefined> {
    const identity = downloadIdentity(input);
    if (identity === null) return undefined;
    const page = yield* store.list({ limit: Number.MAX_SAFE_INTEGER });
    for (const task of page.tasks) {
      if (task.parentId !== parentId || task.status === "failed" || task.status === "cancelled") continue;
      if (task.status === "completed" && (task.output === null || !(yield* outputComplete(task.kind, task.output))))
        continue;
      if (downloadIdentity(task.input) === identity) return task;
    }
    return undefined;
  });
  const awaitAdmission = Effect.fnUntraced(function* (id: string): Effect.fn.Return<void, QueueError> {
    const pending = lookup(pendingAdmissions, id);
    if (pending === undefined) yield* timing.turn("admission.pending");
    else yield* Deferred.await(pending);
  });
  const add = Effect.fnUntraced(function* (
    request: Requests.AddTaskRequest
  ): Effect.fn.Return<{ id: string }, QueueError> {
    const now = yield* timers.now;
    if (P.isTruthy(request.id) && request.id !== undefined) {
      const existing = yield* store.get(request.id ?? "");
      if (existing !== undefined) {
        yield* awaitAdmission(existing.id);
        return { id: existing.id };
      }
    }
    if (
      request.parentId !== undefined &&
      request.parentId !== null &&
      request.parentId.length > 0 &&
      (!(yield* store.has(request.parentId ?? "")) || MutableHashSet.has(removing, request.parentId ?? ""))
    )
      return yield* Errors.ParentTaskUnavailable.make({
        legacyMessage: `add: parent task ${request.parentId} is missing or being removed`,
      });
    const duplicate = yield* findDuplicateDownload(request.input, request.parentId ?? null);
    if (duplicate !== undefined) {
      yield* awaitAdmission(duplicate.id);
      return { id: duplicate.id };
    }
    const id = request.id ?? (yield* random.uuid);
    const task: T.Task = {
      id,
      kind: request.input.kind,
      parentId: request.parentId ?? null,
      input: request.input,
      priority: request.priority ?? PRIORITY_USER,
      groupKey: request.groupKey ?? defaultGroupKey(request.input),
      status: "queued",
      prevStatus: null,
      statusReason: null,
      enteredStatusAt: now,
      attempt: 0,
      maxAttempts: request.maxAttempts ?? 5,
      nextRetryAt: null,
      progress: { ...EMPTY_PROGRESS },
      output: null,
      lastError: null,
      pid: null,
      pidStartedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    yield* store.insert(task);
    const pending = yield* Deferred.make<void, QueueError>();
    const write = yield* persist.insertTask(task).pipe(
      Effect.tapError((error) => Deferred.fail(pending, error)),
      Effect.tap(() => Deferred.succeed(pending, undefined)),
      Effect.forkIn(scope, { startImmediately: true })
    );
    MutableHashMap.set(pendingAdmissions, id, pending);
    yield* Fiber.join(write).pipe(
      Effect.catch(
        Effect.fnUntraced(function* (error) {
          yield* store.remove(id);
          return yield* error;
        })
      ),
      Effect.ensuring(Effect.sync(() => MutableHashMap.remove(pendingAdmissions, id)))
    );
    yield* bus.emit({ type: "transition", taskId: id, from: null, to: "queued", reason: null, attempt: 0, at: now });
    yield* bus.emit({ type: "snapshot-changed", taskId: id, task, at: now });
    yield* scheduler.enqueue(id, task.priority);
    yield* timing.turn("add.enqueued");
    return { id };
  });
  const importCompleted = Effect.fnUntraced(function* (
    request: Requests.ImportCompletedRequest
  ): Effect.fn.Return<{ id: string; created: boolean }, QueueError> {
    if (P.isTruthy(request.id) && request.id !== undefined) {
      const existing = yield* store.get(request.id ?? "");
      if (existing !== undefined) return { id: existing.id, created: false };
    }
    const now = yield* timers.now;
    const id = request.id ?? (yield* random.uuid);
    const size = request.output.size;
    const task: T.Task = {
      id,
      kind: request.input.kind,
      parentId: null,
      input: request.input,
      priority: PRIORITY_USER,
      groupKey: request.groupKey ?? defaultGroupKey(request.input),
      status: "completed",
      prevStatus: null,
      statusReason: "local-import",
      enteredStatusAt: now,
      attempt: 0,
      maxAttempts: 0,
      nextRetryAt: null,
      progress: { percent: 1, bytesDownloaded: size, bytesTotal: size, speedBps: null, etaMs: null, ticks: 1 },
      output: request.output,
      lastError: null,
      pid: null,
      pidStartedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    yield* store.insert(task);
    yield* persist.insertTask(task).pipe(
      Effect.catch(
        Effect.fnUntraced(function* (error) {
          yield* store.remove(id);
          return yield* error;
        })
      )
    );
    yield* bus.emit({ type: "snapshot-changed", taskId: id, task, at: now });
    return { id, created: true };
  });
  const cancel = Effect.fnUntraced(function* (id: string, reason = "user"): Effect.fn.Return<void, QueueError> {
    const task = yield* store.get(id);
    if (task === undefined) return;
    MutableHashSet.add(pendingCancel, id);
    MutableHashMap.remove(pendingPause, id);
    if (HashSet.has(TERMINAL_STATUSES, task.status)) {
      if (task.status !== "cancelled" || !MutableHashMap.has(starting, id)) MutableHashSet.remove(pendingCancel, id);
      return;
    }
    if (task.status === "queued" || task.status === "paused") {
      yield* scheduler.dequeue(id);
      yield* retry.remove(id);
      MutableHashSet.remove(pendingCancel, id);
      yield* applyTransition(id, "cancelled", { trigger: "cancel", reason });
      return;
    }
    if (task.status === "retry-scheduled") {
      yield* retry.remove(id);
      MutableHashSet.remove(pendingCancel, id);
      yield* applyTransition(id, "cancelled", { trigger: "cancel", reason });
      return;
    }
    yield* applyTransition(id, "cancelled", { trigger: "cancel", reason });
    const run = lookup(active, id);
    if (run === undefined) {
      if (MutableHashMap.has(starting, id)) return;
      MutableHashSet.remove(pendingCancel, id);
      yield* scheduler.releaseSlot(id);
      return;
    }
    yield* run.run.cancel().pipe(
      Effect.catchCause((cause) => Effect.logError("task_queue_cancel_threw", cause)),
      Effect.ensuring(Effect.sync(() => MutableHashSet.remove(pendingCancel, id)))
    );
  });
  const pause = Effect.fnUntraced(function* (id: string, reason = "user"): Effect.fn.Return<void, QueueError> {
    const task = yield* store.get(id);
    if (task === undefined) return;
    if (task.status === "queued") {
      yield* scheduler.dequeue(id);
      yield* applyTransition(id, "paused", { trigger: "pause", reason });
      return;
    }
    if (task.status === "retry-scheduled") {
      yield* retry.remove(id);
      yield* applyTransition(id, "paused", { trigger: "pause", reason });
      return;
    }
    if (task.status === "running" || task.status === "processing") {
      const run = lookup(active, id);
      if (run !== undefined || lookup(starting, id)?.suspended === true) MutableHashMap.set(pendingPause, id, reason);
      if (run !== undefined) {
        yield* run.run.pause.pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              MutableHashMap.remove(pendingPause, id);
              yield* Effect.logError("task_queue_pause_threw", cause);
            })
          )
        );
      }
    }
  });
  const resume = Effect.fnUntraced(function* (id: string): Effect.fn.Return<void, QueueError> {
    const task = yield* store.get(id);
    if (task?.status !== "paused") return;
    yield* applyTransition(id, "queued", { trigger: "resume", reason: "resume" });
    yield* scheduler.enqueue(id, task.priority);
  });
  const reconcileQueue = Effect.gen(function* () {
    if (!started || reconcileBusy) return;
    reconcileBusy = true;
    yield* Effect.gen(function* () {
      const now = yield* timers.now;
      const paused = yield* store.list({ limit: 1000, status: "paused" });
      for (const task of paused.tasks) if (task.statusReason === "crash-recovery") yield* resume(task.id);
      for (const status of ["running", "processing"] as const) {
        const page = yield* store.list({ limit: 1000, status });
        for (const task of page.tasks) {
          if (MutableHashMap.has(active, task.id) || now - task.enteredStatusAt < zombieMs) continue;
          yield* applyTransition(task.id, "paused", { reason: "crash-recovery", trigger: "crash-recovery" });
          yield* resume(task.id);
        }
      }
      yield* scheduler.sweepDeadSlots((id) =>
        Effect.map(
          store.get(id),
          (task) =>
            task !== undefined &&
            (task.status === "running" || task.status === "processing") &&
            (MutableHashMap.has(active, id) || now - task.enteredStatusAt < zombieMs)
        )
      );
      const queued = yield* store.list({ limit: 1000, status: "queued" });
      for (const task of queued.tasks) yield* scheduler.ensureEnqueued(task.id, task.priority);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          reconcileBusy = false;
        })
      )
    );
  });
  const armIdle = Effect.fnUntraced(function* (): Effect.fn.Return<void> {
    if (idleMs <= 0) return;
    idleTimer = yield* timers.after(
      idleMs,
      Effect.suspend(() => {
        idleTimer = null;
        return reconcileQueue;
      }).pipe(
        Effect.catchCause((cause) => Effect.logError("task_queue_reconcile_threw", cause)),
        Effect.ensuring(Effect.suspend(() => (started && stopping === 0 ? armIdle() : Effect.void)))
      ),
      { keepAlive: false }
    );
  });
  const start = Effect.gen(function* () {
    if (started) return;
    started = true;
    const tasks = yield* persist.loadAllTasks;
    for (const task of tasks) yield* store.insert(task);
    const orphans = yield* processes.reconcile;
    for (const orphan of orphans)
      if (orphan.killed)
        yield* bus.emit({
          type: "orphan-killed",
          taskId: orphan.taskId,
          pid: orphan.pid,
          pidStartedAt: null,
          signal: "SIGKILL",
          at: yield* timers.now,
        });
    for (const task of tasks) {
      if (task.status === "running" || task.status === "processing") {
        yield* applyTransition(task.id, "paused", { trigger: "crash-recovery", reason: "crash-recovery" });
        yield* resume(task.id);
      } else if (task.status === "paused" && task.statusReason === "crash-recovery") yield* resume(task.id);
      else if (task.status === "queued") yield* scheduler.enqueue(task.id, task.priority);
      else if (task.status === "retry-scheduled" && task.nextRetryAt !== null)
        yield* retry.enqueue(task.id, task.nextRetryAt);
    }
    yield* reconcileQueue;
    yield* armIdle();
  });
  const stop = Effect.gen(function* () {
    if (!started) return;
    stopping++;
    yield* Effect.gen(function* () {
      if (idleTimer !== null) {
        yield* idleTimer;
        idleTimer = null;
      }
      yield* retry.stop;
      for (const [, run] of A.fromIterable(active)) yield* run.run.cancel(0).pipe(Effect.ignore);
      yield* persist.close;
      started = false;
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          stopping--;
        })
      )
    );
  });
  yield* hooks.bind({ dispatch: dispatchOne, demote, retryDue, stalled });
  return TaskQueue.of({
    start,
    stop,
    reconcileQueue,
    add,
    importCompleted,
    findDuplicateDownload,
    get: store.get,
    hasTask: persist.hasTask,
    list: store.list,
    cancel,
    pause,
    resume,
    rename: Effect.fnUntraced(function* (id, title) {
      const task = yield* store.get(id);
      if (task === undefined) return yield* Errors.TaskNotFound.make({ legacyMessage: `Task not found: ${id}` });
      const normalized = Str.trim(title);
      if (normalized.length === 0 || normalized.length > 200)
        return yield* Errors.InvalidTitle.make({ legacyMessage: "Title must contain 1–200 characters" });
      const next = { ...task, input: { ...task.input, title: normalized }, updatedAt: yield* timers.now };
      yield* Effect.gen(function* () {
        yield* store.update(next);
        yield* persist.upsertTask({ task: next, progress: next.progress });
      }).pipe(
        Effect.onError(() =>
          Effect.gen(function* () {
            if ((yield* store.get(id)) === next) yield* store.update(task).pipe(Effect.orDie);
          })
        )
      );
      const current = yield* store.get(id);
      if (current !== undefined)
        yield* bus.emit({ type: "snapshot-changed", taskId: id, task: current, at: yield* timers.now });
    }),
    relocateFileReferences: Effect.fnUntraced(function* (from, to) {
      if (!P.isTruthy(from) || !P.isTruthy(to))
        return yield* Errors.InvalidPathPair.make({ legacyMessage: "Source and destination paths are required" });
      const page = yield* store.list({ limit: Number.MAX_SAFE_INTEGER });
      const affected = A.filter(
        page.tasks,
        (task) => task.output?.filePath === from || task.input.options?.sourceFilePath === from
      );
      if (A.some(affected, (task) => !HashSet.has(TERMINAL_STATUSES, task.status)))
        return yield* Errors.FileInUse.make({
          legacyMessage: "Finish or cancel tasks using this file before renaming it",
        });
      const ids = HashSet.fromIterable(A.map(affected, (task) => task.id));
      if (
        A.some(
          page.tasks,
          (task) =>
            P.isTruthy(task.parentId) &&
            task.parentId !== null &&
            HashSet.has(ids, task.parentId) &&
            !HashSet.has(TERMINAL_STATUSES, task.status)
        )
      )
        return yield* Errors.DependentTasksActive.make({
          legacyMessage: "Finish or cancel dependent tasks before renaming their source file",
        });
      const updated: T.Task[] = [];
      yield* Effect.gen(function* () {
        for (const task of affected) {
          const next = {
            ...task,
            input:
              task.input.options?.sourceFilePath === from
                ? { ...task.input, options: { ...task.input.options, sourceFilePath: to } }
                : task.input,
            output: task.output?.filePath === from ? { ...task.output, filePath: to } : task.output,
            updatedAt: yield* timers.now,
          };
          updated.push(next);
          yield* store.update(next);
        }
        yield* persist.upsertTasks(A.map(updated, (task) => ({ task, progress: task.progress })));
      }).pipe(
        Effect.onError(() =>
          Effect.gen(function* () {
            for (const [index, task] of updated.entries()) {
              const original = affected[index];
              if (original !== undefined && (yield* store.get(task.id)) === task)
                yield* store.update(original).pipe(Effect.orDie);
            }
          })
        )
      );
      for (const task of updated) {
        const current = yield* store.get(task.id);
        if (current !== undefined)
          yield* bus.emit({ type: "snapshot-changed", taskId: task.id, task: current, at: yield* timers.now });
      }
    }),
    getTaskLog: Effect.fnUntraced(function* (id) {
      const attempt = yield* persist.loadLatestAttempt(id);
      if (attempt === null) return null;
      const parts: string[] = [];
      if (attempt.stdoutTail !== null && Str.trim(attempt.stdoutTail).length > 0) parts.push(attempt.stdoutTail ?? "");
      if (attempt.stderrTail !== null && Str.trim(attempt.stderrTail).length > 0) parts.push(attempt.stderrTail ?? "");
      const combined = Str.trim(A.join(parts, "\n"));
      return combined.length > 0 ? combined : null;
    }),
    retryManual: Effect.fnUntraced(function* (id, opts) {
      const task = yield* store.get(id);
      if (task === undefined || (task.status !== "failed" && task.status !== "cancelled")) return;
      yield* applyTransition(
        id,
        "queued",
        { trigger: task.status === "failed" ? "retry-manual" : "requeue", reason: "manual" },
        P.isTruthy(opts) && opts !== undefined ? { ...task.input, options: opts } : undefined
      );
      yield* scheduler.enqueue(id, task.priority);
    }),
    setMaxConcurrency: scheduler.setMaxConcurrency,
    setMaxConcurrentDownloads: scheduler.setMaxConcurrentDownloads,
    setMaxPerGroup: scheduler.setMaxPerGroup,
    removeFromHistory: Effect.fnUntraced(function* (id) {
      const task = yield* store.get(id);
      if (task === undefined) return;
      if (!HashSet.has(TERMINAL_STATUSES, task.status))
        return yield* Errors.TaskNotTerminal.make({
          legacyMessage: `removeFromHistory: ${id} is not in a terminal state`,
        });
      const descendants: string[] = [];
      const pending = [id];
      const seen = MutableHashSet.make(id);
      while (pending.length > 0) {
        const parent = pending.pop();
        if (parent === undefined) break;
        let cursor: string | null = null;
        do {
          const page: import("./TaskStore.service.js").TaskPage = yield* store.list({
            parentId: parent,
            limit: 1000,
            cursor,
          });
          for (const child of page.tasks) {
            if (MutableHashSet.has(seen, child.id)) continue;
            MutableHashSet.add(seen, child.id);
            pending.push(child.id);
            descendants.push(child.id);
          }
          cursor = page.nextCursor;
        } while (cursor !== null && cursor.length > 0);
      }
      const removingIds = [...descendants.reverse(), id];
      for (const child of removingIds) MutableHashSet.add(removing, child);
      yield* Effect.gen(function* () {
        for (const child of removingIds) {
          const current = yield* store.get(child);
          if (current !== undefined && !HashSet.has(TERMINAL_STATUSES, current.status)) yield* cancel(child, "user");
          const completion = lookup(finished, child);
          if (completion !== undefined) yield* Deferred.await(completion);
          else yield* timing.turn("history.attemptFinished");
        }
        yield* persist.deleteTask(id);
        for (const child of removingIds) {
          yield* store.remove(child);
          yield* bus.emit({ type: "task-removed", taskId: child, at: yield* timers.now });
        }
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            for (const child of removingIds) MutableHashSet.remove(removing, child);
          })
        )
      );
    }),
    stats: Effect.gen(function* () {
      const schedulerStats = yield* scheduler.stats;
      const stats = yield* store.stats(schedulerStats.capacity);
      const current = yield* scheduler.stats;
      return {
        ...stats,
        running: current.running,
        queued: current.queued,
        perGroup: { ...stats.perGroup, ...current.perGroup },
      };
    }),
    subscribe: bus.subscribe,
    on: bus.on,
  });
});
const defaultGroupKey = (input: T.TaskInput): string => {
  if (input.kind === "transcription") return TRANSCRIPTION_GROUP_KEY;
  if (P.isTruthy(input.subscriptionId) && input.subscriptionId !== undefined) return `sub:${input.subscriptionId}`;
  try {
    return new URL(input.url).host || "unknown";
  } catch {
    return "unknown";
  }
};
export const layer = (options?: TaskQueueOptions) => Layer.effect(TaskQueue, make(options));

/** Compose the callback-bearing services; callers may instead provide their own operation services. */
export const internalLayers = (options: TaskQueueOptions = {}) =>
  Layer.mergeAll(
    Scheduler.layerFromHooks({
      maxConcurrency: options.maxConcurrency ?? 4,
      defaultMaxPerGroup: options.defaultMaxPerGroup ?? null,
      admissionEnabled: options.sourceAdmission ?? true,
    }),
    Retry.layerFromHooks,
    Watchdog.layerFromHooks(options),
    Registry.layer
  ).pipe(Layer.provideMerge(TaskQueueHooks.layer));
