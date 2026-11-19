import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { virtualError } from "../src/classifier/index.js";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { OutputProbe } from "../src/OutputProbe.service.js";
import { ProcessControl } from "../src/ProcessControl.service.js";
import { ProcessRegistry } from "../src/process/ProcessRegistry.service.js";
import { QueueRandom } from "../src/QueueRandom.service.js";
import { QueueTimers } from "../src/QueueTimers.service.js";
import { RegistryInspection } from "../src/RegistryInspection.service.js";
import { layer as admissionLayer } from "../src/SourceAdmission.layer.js";
import { RetryScheduler } from "../src/scheduler/RetryScheduler.service.js";
import { layer as eventsLayer } from "../src/TaskEvents.layer.js";
import { TaskExecutor } from "../src/TaskExecutor.service.js";
import { makeMemory } from "../src/TaskPersistence.layer.js";
import { TaskPersistence } from "../src/TaskPersistence.service.js";
import { HostFailure } from "../src/TaskQueue.errors.js";
import { internalLayers, layer as queueLayer } from "../src/TaskQueue.layer.js";
import { TaskQueue, TaskQueueHooks } from "../src/TaskQueue.service.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { TaskStore } from "../src/TaskStore.service.js";
import { task } from "./fixtures.js";
import type { ExecutorContext, ExecutorFinishEvent } from "../src/Executor.model.js";
import type { RegistryCounts } from "../src/RegistryInspection.service.js";
import type { ExecutorSink } from "../src/TaskExecutor.service.js";

const snapshots: Record<string, () => RegistryCounts> = {};
let startGate: Deferred.Deferred<void> | undefined;
let entered: Deferred.Deferred<void> | undefined;
let closeGate: Deferred.Deferred<void> | undefined;
let closeEntered: Deferred.Deferred<void> | undefined;
let controlGate: Deferred.Deferred<void> | undefined;
let reject = false;
let sink: ExecutorSink | undefined;
let attempt = "";
let runs = 0;
const controls: string[] = [];
const persistence = Layer.effect(
  TaskPersistence,
  Effect.sync(() => {
    const memory = makeMemory().service;
    return TaskPersistence.of({
      ...memory,
      closeAttempt: Effect.fnUntraced(function* (input) {
        if (closeEntered !== undefined) yield* Deferred.succeed(closeEntered, undefined);
        if (closeGate !== undefined) yield* Deferred.await(closeGate);
        yield* memory.closeAttempt(input);
      }),
    });
  })
);
const deps = Layer.mergeAll(
  storeLayer,
  eventsLayer,
  admissionLayer,
  persistence,
  LegacyTiming.layer,
  TaskQueueHooks.layer,
  Layer.succeed(OutputProbe, { filePresent: Effect.fn("filePresent")(() => Effect.succeed(true)) }),
  Layer.succeed(ProcessControl, {
    kill: Effect.fn("kill")(() => Effect.void),
    isAlive: Effect.fn("isAlive")(() => Effect.succeed(false)),
    startTime: Effect.fn("startTime")(() => Effect.succeed(null)),
  }),
  Layer.succeed(QueueRandom, { uuid: Effect.sync(() => `attempt-${++runs}`), next: Effect.succeed(0) }),
  Layer.succeed(QueueTimers, {
    now: Effect.succeed(1000),
    sleep: Effect.fn("sleep")(() => Effect.void),
    after: Effect.fn("after")(() => Effect.succeed(Effect.void)),
  }),
  Layer.succeed(TaskExecutor, {
    run: Effect.fnUntraced(function* (ctx: ExecutorContext, nextSink: ExecutorSink) {
      sink = nextSink;
      attempt = ctx.attemptId;
      if (entered !== undefined) yield* Deferred.succeed(entered, undefined);
      if (startGate !== undefined) yield* Deferred.await(startGate);
      if (reject)
        return yield* HostFailure.make({
          original: new Error("executor rejected"),
          legacyMessage: "executor rejected",
        });
      yield* nextSink.emit({
        type: "spawn",
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        pid: 12,
        pidStartedAt: 1,
        kind: "yt-dlp",
        spawnedAt: 1000,
      });
      const finish = nextSink.emit({
        type: "finish",
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        closedAt: 1001,
        stdoutTail: "",
        stderrTail: "",
        result: { type: "cancelled" },
      });
      return {
        cancel: Effect.fn("cancel")(() =>
          Effect.sync(() => {
            controls.push("cancel");
          }).pipe(
            Effect.andThen(
              Effect.suspend(() => (controlGate === undefined ? Effect.void : Deferred.await(controlGate)))
            ),
            Effect.andThen(finish)
          )
        ),
        pause: Effect.sync(() => {
          controls.push("pause");
        }).pipe(
          Effect.andThen(Effect.suspend(() => (controlGate === undefined ? Effect.void : Deferred.await(controlGate)))),
          Effect.andThen(finish)
        ),
      };
    }),
  })
);
const inspection = Layer.succeed(RegistryInspection, {
  register: (name, read) => {
    snapshots[name] = read;
  },
});
const services = internalLayers({ maxConcurrency: 1 }).pipe(Layer.provideMerge(deps));
const testLayer = queueLayer({ idleQueueKickMs: 0 }).pipe(Layer.provideMerge(services), Layer.provideMerge(inspection));
const reset = Effect.sync(() => {
  startGate = undefined;
  entered = undefined;
  closeGate = undefined;
  closeEntered = undefined;
  controlGate = undefined;
  reject = false;
  sink = undefined;
  runs = 0;
  controls.length = 0;
});
const drained = Effect.gen(function* () {
  const processes = yield* ProcessRegistry;
  const processCount = yield* processes.size;
  expect(processCount).toBe(0);
  for (let i = 0; i < 100; i++) {
    if (snapshots.queue?.().finished === 0 && snapshots.scheduler?.().running === 0) break;
    yield* Effect.yieldNow;
  }
  expect(snapshots.queue?.()).toEqual({
    active: 0,
    finished: 0,
    starting: 0,
    pendingAdmissions: 0,
    pendingPause: 0,
    pendingCancel: 0,
    removing: 0,
    progressDirty: 0,
    progressLastWrite: 0,
  });
  expect(snapshots.scheduler?.()).toEqual({
    running: 0,
    dispatching: 0,
    reservations: 0,
    leases: 0,
    groups: 0,
    ready: 0,
  });
  expect(snapshots.admission?.()).toEqual({ held: 0, waiting: 0, waitingKeys: 0, listeners: 1 });
  expect(snapshots.events?.()).toEqual({ buckets: 0 });
  expect(snapshots.watchdog?.()).toEqual({ entries: 0 });
});
const finish = Effect.fn("finish")((result: ExecutorFinishEvent["result"]) =>
  Effect.suspend(() =>
    sink === undefined
      ? Effect.die("missing sink")
      : sink.emit({
          type: "finish",
          taskId: "a",
          attemptId: attempt,
          closedAt: 1001,
          stdoutTail: "",
          stderrTail: "",
          result,
        })
  )
);
const add = Effect.fn("add")((queue: TaskQueue["Service"]) =>
  queue.add({ id: "a", input: { kind: "video", url: "https://example.com/a" } })
);
layer(testLayer, { buildPerTest: true })((it) => {
  for (const entry of ["add", "resume", "retryManual"] as const)
    for (const operation of ["cancel", "pause"] as const) {
      it.effect(`R3: ${operation} delivered after suspended startup does not hold ${entry}`, () =>
        Effect.gen(function* () {
          yield* reset;
          startGate = yield* Deferred.make<void>();
          entered = yield* Deferred.make<void>();
          controlGate = yield* Deferred.make<void>();
          const queue = yield* TaskQueue;
          yield* queue.start;
          const store = yield* TaskStore;
          if (entry !== "add") yield* store.insert(task("a", { status: entry === "resume" ? "paused" : "failed" }));
          const dispatch = yield* (entry === "add" ? add(queue) : queue[entry]("a")).pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          // Deferred completion resumes waiters inline; yield so run reaches its gated await.
          yield* Effect.yieldNow;
          yield* queue[operation]("a");
          yield* Deferred.succeed(startGate, undefined);
          yield* Fiber.join(dispatch);
          expect(controls).toEqual([operation]);
          expect(snapshots.queue?.().active).toBe(1);
          yield* Deferred.succeed(controlGate, undefined);
          yield* drained;
          yield* queue.stop;
        })
      );
    }
  for (const outcome of ["success", "error", "retry", "cancelled", "paused", "illegal"] as const) {
    it.effect(`registry outcomes: ${outcome}`, () =>
      Effect.gen(function* () {
        yield* reset;
        const queue = yield* TaskQueue;
        yield* queue.start;
        yield* add(queue);
        if (outcome === "cancelled") yield* queue.cancel("a");
        else if (outcome === "paused") yield* queue.pause("a");
        else {
          if (outcome === "illegal") {
            const store = yield* TaskStore;
            const task = yield* store.get("a");
            if (task !== undefined) yield* store.update({ ...task, status: "paused" });
          }
          yield* finish(
            outcome === "error" || outcome === "retry"
              ? {
                  type: "error",
                  exitCode: 1,
                  error: {
                    ...virtualError("http-429", "failure"),
                    retryable: outcome === "retry",
                    suggestedRetryAfterMs: 10,
                  },
                }
              : { type: "success", output: { filePath: "/fixture", size: 1, durationMs: null, sha256: null } }
          );
        }
        yield* drained;
        const retry = yield* RetryScheduler;
        const retrySize = yield* retry.size;
        expect(retrySize).toBe(outcome === "retry" ? 1 : 0);
        yield* queue.stop;
      })
    );
  }
  for (const outcome of ["rejection", "interruption"] as const)
    for (const operation of ["cancel", "pause"] as const) {
      it.effect(`R1/R2 registry outcomes: ${operation} then ${outcome}, followed by retry`, () =>
        Effect.gen(function* () {
          yield* reset;
          startGate = yield* Deferred.make<void>();
          entered = yield* Deferred.make<void>();
          const queue = yield* TaskQueue;
          yield* queue.start;
          const dispatch = yield* add(queue).pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          // Deferred completion resumes waiters inline; yield so run reaches its gated await.
          yield* Effect.yieldNow;
          yield* queue[operation]("a");
          if (outcome === "rejection") {
            reject = true;
            yield* Deferred.succeed(startGate, undefined);
            yield* Fiber.join(dispatch).pipe(Effect.ignore);
          } else yield* Fiber.interrupt(dispatch);
          yield* drained;
          if ((yield* queue.get("a"))?.status === "running") yield* queue.cancel("a");
          reject = false;
          startGate = undefined;
          entered = undefined;
          yield* queue.retryManual("a");
          expect(controls).toEqual([]);
          const retried = yield* queue.get("a");
          expect(retried?.status).toBe("running");
          yield* finish({ type: "cancelled" });
          yield* drained;
          yield* queue.stop;
        })
      );
    }
  for (const window of ["start", "finish"] as const) {
    it.effect(`registry outcomes: stop during ${window} preserves in-flight ownership until completion`, () =>
      Effect.gen(function* () {
        yield* reset;
        const queue = yield* TaskQueue;
        yield* queue.start;
        if (window === "start") {
          startGate = yield* Deferred.make<void>();
          entered = yield* Deferred.make<void>();
        }
        const dispatch = yield* add(queue).pipe(Effect.forkChild);
        if (window === "start") yield* Deferred.await(entered!);
        else yield* Fiber.join(dispatch);
        if (window === "finish") {
          closeGate = yield* Deferred.make<void>();
          closeEntered = yield* Deferred.make<void>();
          yield* finish({ type: "cancelled" });
          yield* Deferred.await(closeEntered);
        }
        yield* queue.stop;
        expect(snapshots.queue?.()).toEqual({
          active: 0,
          finished: 1,
          starting: window === "start" ? 1 : 0,
          pendingAdmissions: 0,
          pendingPause: 0,
          pendingCancel: 0,
          removing: 0,
          progressDirty: 0,
          progressLastWrite: 0,
        });
        expect(snapshots.scheduler?.()).toEqual({
          running: 1,
          dispatching: window === "start" ? 1 : 0,
          reservations: 1,
          leases: 1,
          groups: 1,
          ready: 0,
        });
        expect(snapshots.admission?.()).toEqual({ held: 1, waiting: 0, waitingKeys: 0, listeners: 1 });
        expect(snapshots.events?.()).toEqual({ buckets: 0 });
        expect(snapshots.watchdog?.()).toEqual({ entries: 0 });
        const processRegistry = yield* ProcessRegistry;
        const heldProcesses = yield* processRegistry.size;
        expect(heldProcesses).toBe(window === "finish" ? 1 : 0);
        if (window === "start") {
          yield* Deferred.succeed(startGate!, undefined);
          yield* Fiber.join(dispatch);
          yield* finish({ type: "cancelled" });
        } else yield* Deferred.succeed(closeGate!, undefined);
        yield* drained;
      })
    );
  }
});
