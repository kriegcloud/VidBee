import { dual } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Result from "effect/Result";
import { IllegalTransition } from "../TaskQueue.errors.js";
import { TERMINAL_STATUSES } from "../types.js";
import type { TransitionContext } from "../Classifier.model.js";
/**
 * TaskFSM — the only allowed mutator of `task.status`.
 *
 * The transition table mirrors docs/vidbee-task-queue-state-machine-design.md §3.1
 * one-for-one. Any combination not listed below MUST throw IllegalTransitionError;
 * adapters must NOT define new transitions.
 */
import type { Task, TaskStatus } from "../types.js";

export type { TransitionContext, TransitionTrigger } from "../Classifier.model.js";

function illegal(from: TaskStatus, to: TaskStatus, reason?: string): Result.Result<never, IllegalTransition> {
  return Result.fail(
    IllegalTransition.make({
      from,
      to,
      reason,
      legacyMessage: `IllegalTransition: ${from} -> ${to}${reason !== undefined && reason.length > 0 ? ` (${reason})` : ""}`,
    })
  );
}

/**
 * Static legality table — enumerates every From→To combination listed in §3.1.
 * Keys are From, values are the set of legal To statuses. Anything not present
 * MUST be rejected.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<TaskStatus, HashSet.HashSet<TaskStatus>>> = {
  queued: HashSet.fromIterable<TaskStatus>(["running", "paused", "cancelled"]),
  running: HashSet.fromIterable<TaskStatus>([
    "processing",
    "completed",
    "retry-scheduled",
    "failed",
    "paused",
    "cancelled",
  ]),
  processing: HashSet.fromIterable<TaskStatus>(["completed", "retry-scheduled", "failed", "paused", "cancelled"]),
  paused: HashSet.fromIterable<TaskStatus>(["queued", "cancelled", "failed"]),
  "retry-scheduled": HashSet.fromIterable<TaskStatus>(["queued", "paused", "cancelled"]),
  failed: HashSet.fromIterable<TaskStatus>(["queued"]),
  cancelled: HashSet.fromIterable<TaskStatus>(["queued"]),
  completed: HashSet.empty<TaskStatus>(),
};

export const isLegalTransition: {
  (from: TaskStatus, to: TaskStatus): boolean;
  (to: TaskStatus): (from: TaskStatus) => boolean;
} = dual(2, (from: TaskStatus, to: TaskStatus): boolean => HashSet.has(LEGAL_TRANSITIONS[from], to));

/**
 * Apply a transition and return the next Task value. Pure: callers (Scheduler,
 * Executor, RetryScheduler) feed in the current Task and receive a new one;
 * persistence and event emission live in the orchestrator.
 *
 * Throws IllegalTransitionError on anything outside §3.1's table.
 */
export const transition: {
  (task: Readonly<Task>, to: TaskStatus, ctx: TransitionContext): Result.Result<Task, IllegalTransition>;
  (to: TaskStatus, ctx: TransitionContext): (task: Readonly<Task>) => Result.Result<Task, IllegalTransition>;
} = dual(3, (task: Readonly<Task>, to: TaskStatus, ctx: TransitionContext): Result.Result<Task, IllegalTransition> => {
  const from = task.status;
  if (!isLegalTransition(from, to)) {
    return illegal(from, to, ctx.trigger);
  }

  const now = ctx.now;
  const next: Task = {
    ...task,
    prevStatus: from,
    status: to,
    statusReason: ctx.reason ?? null,
    enteredStatusAt: now,
    updatedAt: now,
  };

  switch (to) {
    case "running":
      next.input = {
        ...task.input,
        options: { ...task.input.options, startedAt: task.input.options?.startedAt ?? now },
      };
      // attempt is incremented when we leave retry-scheduled (see retry-tick path);
      // here we only handle the initial dispatch from `queued`. The orchestrator
      // is responsible for stamping pid/pidStartedAt on the spawn callback.
      if (from === "queued" && task.attempt === 0) {
        next.attempt = 1;
      }
      break;
    case "queued":
      if (HashSet.has(TERMINAL_STATUSES, from)) {
        next.input = {
          ...task.input,
          options: { ...task.input.options, completedAt: undefined },
        };
      }
      if (ctx.trigger === "retry-tick") {
        next.attempt = task.attempt + 1;
        next.nextRetryAt = null;
      } else if (ctx.trigger === "retry-manual") {
        next.attempt = 0;
        next.lastError = null;
        next.nextRetryAt = null;
      } else if (ctx.trigger === "requeue") {
        next.lastError = null;
        next.nextRetryAt = null;
      } else if (ctx.trigger === "resume") {
        // resume from paused: keep progress, do not bump attempt
        next.nextRetryAt = null;
      }
      break;
    case "completed": {
      if (ctx.output === undefined) {
        return illegal(from, to, "finalize-success requires output");
      }
      // Hard guard from §3.1: completed only legal when file exists with size > 0.
      // Existence is the orchestrator's job (FS check); size is checked here.
      if (ctx.output.size <= 0) {
        return illegal(from, to, "completed requires output.size > 0");
      }
      next.output = ctx.output;
      next.lastError = null;
      next.pid = null;
      next.pidStartedAt = null;
      break;
    }
    case "failed": {
      if (ctx.error !== undefined) next.lastError = ctx.error;
      next.pid = null;
      next.pidStartedAt = null;
      break;
    }
    case "cancelled": {
      next.pid = null;
      next.pidStartedAt = null;
      break;
    }
    case "retry-scheduled": {
      if (ctx.nextRetryAt == null || ctx.nextRetryAt <= 0) {
        return illegal(from, to, "retry-scheduled requires nextRetryAt");
      }
      if (ctx.error !== undefined) next.lastError = ctx.error;
      next.nextRetryAt = ctx.nextRetryAt;
      next.pid = null;
      next.pidStartedAt = null;
      break;
    }
    case "paused": {
      // progress is preserved; pid is cleared because the process is gone
      // (SIGTERM on the running path, or never spawned on the queued path).
      next.pid = null;
      next.pidStartedAt = null;
      break;
    }
    case "processing":
      // running -> processing — pid stays bound to the same yt-dlp child.
      break;
  }

  return Result.succeed(next);
});
