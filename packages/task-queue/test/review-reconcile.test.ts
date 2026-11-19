import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { OutputProbe } from "../src/OutputProbe.service.js";
import { ProcessControl } from "../src/ProcessControl.service.js";
import { ProcessRegistry } from "../src/process/ProcessRegistry.service.js";
import { Watchdog } from "../src/process/Watchdog.service.js";
import { QueueRandom } from "../src/QueueRandom.service.js";
import { QueueTimers } from "../src/QueueTimers.service.js";
import { RetryScheduler } from "../src/scheduler/RetryScheduler.service.js";
import { Scheduler } from "../src/scheduler/Scheduler.service.js";
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
let admitDuringSweep = false;
const scheduler = Layer.effect(
  Scheduler,
  Effect.gen(function* () {
    const hooks = yield* TaskQueueHooks;
    return Scheduler.of({
      enqueue: Effect.fn("fixture.scheduler")(() => Effect.void),
      ensureEnqueued: Effect.fn("fixture.scheduler")(() => Effect.void),
      dequeue: Effect.fn("fixture.scheduler")(() => Effect.succeed(true)),
      kick: Effect.void,
      releaseSlot: Effect.fn("fixture.scheduler")(() => Effect.void),
      setMaxConcurrency: Effect.fn("fixture.scheduler")(() => Effect.void),
      setMaxConcurrentDownloads: Effect.fn("fixture.scheduler")(() => Effect.void),
      setMaxPerGroup: Effect.fn("fixture.scheduler")(() => Effect.void),
      sweepDeadSlots: Effect.fnUntraced(function* (isLive) {
        if (!admitDuringSweep) return;
        // The sweep was requested while queued. Its lock body runs after dispatch completes.
        yield* hooks.dispatch("between-snapshot-and-lock").pipe(Effect.orDie);
        const result = isLive("between-snapshot-and-lock");
        const live = Effect.isEffect(result) ? yield* result : result;
        expect(live).toBe(true);
      }),
      stats: Effect.succeed({ capacity: 1, running: 1, queued: 0, perGroup: {} }),
    });
  })
);
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
const executor = Layer.succeed(TaskExecutor, {
  run: Effect.fn("fakeExecutor.run")(function* (context: ExecutorContext, nextSink: ExecutorSink) {
    yield* nextSink.emit({
      type: "spawn",
      taskId: context.taskId,
      attemptId: context.attemptId,
      pid: 42,
      pidStartedAt: 1,
      kind: "yt-dlp",
      spawnedAt: 1000,
    });
    return {
      cancel: Effect.fn("fakeExecutor.cancel")(() => record("executor-cancel")),
      pause: record("executor-pause"),
    };
  }),
});
const edges = Layer.mergeAll(
  storeLayer,
  eventLayer,
  layerMemory,
  executor,
  watchdog,
  registry,
  retry,
  LegacyTiming.layer,
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
).pipe(Layer.provideMerge(TaskQueueHooks.layer));
const testLayer = queueLayer({ idleQueueKickMs: 0 }).pipe(Layer.provideMerge(edges));

layer(testLayer)((it) => {
  it.effect("M1: reconciliation passes a live accessor rather than a pre-lock snapshot", () =>
    Effect.gen(function* () {
      const queue = yield* TaskQueue;
      yield* queue.start;
      yield* queue.add({
        id: "between-snapshot-and-lock",
        input: { kind: "video", url: "https://example.com/interleave" },
      });
      admitDuringSweep = true;
      yield* queue.reconcileQueue;
      const task = yield* queue.get("between-snapshot-and-lock");
      expect(task?.status).toBe("running");
      yield* queue.stop;
    })
  );
});
