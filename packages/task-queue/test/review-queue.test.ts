import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { OutputProbe } from "../src/OutputProbe.service.js";
import { ProcessControl } from "../src/ProcessControl.service.js";
import { ProcessRegistry } from "../src/process/ProcessRegistry.service.js";
import { Watchdog } from "../src/process/Watchdog.service.js";
import { QueueRandom } from "../src/QueueRandom.service.js";
import { QueueTimers } from "../src/QueueTimers.service.js";
import { layer as admissionLayer } from "../src/SourceAdmission.layer.js";
import { RetryScheduler } from "../src/scheduler/RetryScheduler.service.js";
import { layerFromHooks } from "../src/scheduler/Scheduler.layer.js";
import { layer as eventLayer } from "../src/TaskEvents.layer.js";
import { TaskExecutor } from "../src/TaskExecutor.service.js";
import { layerMemory } from "../src/TaskPersistence.layer.js";
import { layer as queueLayer } from "../src/TaskQueue.layer.js";
import { TaskQueue, TaskQueueHooks } from "../src/TaskQueue.service.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import type { ExecutorContext } from "../src/Executor.model.js";
import type { ExecutorSink } from "../src/TaskExecutor.service.js";

const calls: string[] = [];
const record = (name: string) =>
  Effect.sync(() => {
    calls.push(name);
  });
const scheduler = layerFromHooks({ maxConcurrency: 1 });
const retry = Layer.succeed(RetryScheduler, {
  enqueue: Effect.fn("fakeRetry.enqueue")((id, at) => record(`retry:${id}:${at}`)),
  remove: Effect.fn("fakeRetry.remove")(() => Effect.succeed(true)),
  tick: record("retry-tick"),
  stop: record("retry-stop"),
  size: Effect.succeed(0),
});
const watchdog = Layer.succeed(Watchdog, {
  arm: Effect.fn("fakeWatchdog.arm")((id, status) => record(`arm:${id}:${status}`)),
  promoteToProcessing: Effect.fn("fakeWatchdog.processing")((id) => record(`processing:${id}`)),
  bump: Effect.fn("fakeWatchdog.bump")((id) => record(`bump:${id}`)),
  disarm: Effect.fn("fakeWatchdog.disarm")((id) => record(`disarm:${id}`)),
  size: Effect.succeed(0),
});
const registry = Layer.succeed(ProcessRegistry, {
  reconcile: record("reconcile").pipe(Effect.as([])),
  recordSpawn: Effect.fn("fakeRegistry.spawn")((input) => record(`spawn:${input.taskId}:${input.pid}`)),
  recordClose: Effect.fn("fakeRegistry.close")((id) => record(`close:${id}`)),
  cancel: Effect.fn("fakeRegistry.cancel")((id) => record(`registry-cancel:${id}`)),
  size: Effect.succeed(0),
});
let gate: Deferred.Deferred<void> | undefined;
let entered: Deferred.Deferred<void> | undefined;
let duringStart: Effect.Effect<void> | undefined;
const executor = Layer.succeed(TaskExecutor, {
  run: Effect.fnUntraced(function* (context: ExecutorContext, nextSink: ExecutorSink) {
    if (duringStart !== undefined) yield* duringStart;
    if (entered !== undefined) yield* Deferred.succeed(entered, undefined);
    if (gate !== undefined) yield* Deferred.await(gate);
    const finish = nextSink.emit({
      type: "finish",
      taskId: context.taskId,
      attemptId: context.attemptId,
      closedAt: 1001,
      stdoutTail: "",
      stderrTail: "",
      result: { type: "cancelled" },
    });
    return {
      cancel: Effect.fnUntraced(function* () {
        yield* record("cancel");
        yield* finish;
      }),
      pause: record("pause").pipe(Effect.andThen(finish)),
    };
  }),
});
const edges = Layer.mergeAll(
  eventLayer,
  layerMemory,
  executor,
  watchdog,
  registry,
  retry,
  Layer.succeed(QueueTimers, {
    now: Effect.succeed(1000),
    sleep: Effect.fn("fakeTimer.sleep")(() => Effect.void),
    after: Effect.fn("fakeTimer.after")(() => Effect.succeed(Effect.void)),
  }),
  Layer.succeed(QueueRandom, { next: Effect.succeed(0), uuid: Effect.succeed("injection-attempt") }),
  Layer.succeed(OutputProbe, { filePresent: Effect.fn("fakeProbe")(() => Effect.succeed(true)) }),
  Layer.succeed(ProcessControl, {
    kill: Effect.fn("fakeKill")(() => Effect.void),
    isAlive: Effect.fn("fakeAlive")(() => Effect.succeed(false)),
    startTime: Effect.fn("fakeStart")(() => Effect.succeed(null)),
  }),
  scheduler
).pipe(Layer.provideMerge(Layer.mergeAll(storeLayer, admissionLayer, LegacyTiming.layer, TaskQueueHooks.layer)));
const testLayer = queueLayer({ idleQueueKickMs: 0 }).pipe(Layer.provideMerge(edges));

layer(testLayer, { buildPerTest: true })((it) => {
  it.effect("U1: a native synchronous start drops its re-entrant pause too", () =>
    Effect.gen(function* () {
      calls.length = 0;
      gate = undefined;
      entered = undefined;
      const queue = yield* TaskQueue;
      duringStart = queue.pause("sync").pipe(Effect.orDie);
      yield* queue.start;
      yield* queue.add({ id: "sync", input: { kind: "video", url: "https://example.com/sync" } });
      duringStart = undefined;
      expect((yield* queue.get("sync"))?.status).toBe("running");
      expect(calls).not.toContain("pause");
      yield* queue.cancel("sync");
      yield* queue.stop;
    })
  );
  for (const operation of ["cancel", "pause"] as const) {
    it.effect(`M7: ${operation} during executor startup reaches the eventual handle and retains capacity`, () =>
      Effect.gen(function* () {
        calls.length = 0;
        gate = yield* Deferred.make<void>();
        entered = yield* Deferred.make<void>();
        const queue = yield* TaskQueue;
        yield* queue.start;
        const dispatch = yield* queue
          .add({ id: "starting", input: { kind: "video", url: "https://example.com/start" } })
          .pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        // Deferred completion resumes waiters inline; yield so run reaches its gated await.
        yield* Effect.yieldNow;
        yield* queue[operation]("starting");
        yield* queue[operation]("starting");
        const pending = yield* queue.stats;
        expect(pending.running).toBe(1);
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(dispatch);
        yield* Effect.yieldNow;
        expect(calls).toContain(operation);
        const task = yield* queue.get("starting");
        expect(task?.status).toBe(operation === "cancel" ? "cancelled" : "paused");
        const stats = yield* queue.stats;
        expect(stats.running).toBe(0);
        if (operation === "pause") yield* queue.cancel("starting");
        yield* queue.removeFromHistory("starting");
        yield* queue.stop;
      })
    );
  }
  it.effect("M6: interrupted executor startup completes attempt cleanup and releases the reservation", () =>
    Effect.gen(function* () {
      gate = yield* Deferred.make<void>();
      entered = yield* Deferred.make<void>();
      const queue = yield* TaskQueue;
      yield* queue.start;
      const dispatch = yield* queue
        .add({ id: "interrupted", input: { kind: "video", url: "https://example.com/start" } })
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      // Deferred completion resumes waiters inline; yield so run reaches its gated await.
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(dispatch);
      const stats = yield* queue.stats;
      expect(stats.running).toBe(0);
      yield* queue.cancel("interrupted");
      yield* queue.removeFromHistory("interrupted");
      const removed = yield* queue.get("interrupted");
      expect(removed).toBeUndefined();
      yield* queue.stop;
    })
  );
});
