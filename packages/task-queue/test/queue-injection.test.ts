import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { OutputProbe } from "../src/OutputProbe.service.js";
import { ClockTickRate, LinuxProcessIdentity } from "../src/ProcessControl.model.js";
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
import { TaskPersistence } from "../src/TaskPersistence.service.js";
import { layer as queueLayer } from "../src/TaskQueue.layer.js";
import { TaskQueue, TaskQueueHooks } from "../src/TaskQueue.service.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { task } from "./fixtures.js";
import type { ExecutorContext } from "../src/Executor.model.js";
import type { ExecutorSink } from "../src/TaskExecutor.service.js";

const calls: string[] = [];
let sink: ExecutorSink | undefined;
const record = (name: string) =>
  Effect.sync(() => {
    calls.push(name);
  });
const scheduler = Layer.effect(
  Scheduler,
  Effect.gen(function* () {
    const hooks = yield* TaskQueueHooks;
    return Scheduler.of({
      enqueue: Effect.fn("fakeScheduler.enqueue")((id) =>
        record(`enqueue:${id}`).pipe(Effect.andThen(hooks.dispatch(id)), Effect.orDie, Effect.asVoid)
      ),
      ensureEnqueued: Effect.fn("fakeScheduler.ensure")((id) => record(`ensure:${id}`)),
      dequeue: Effect.fn("fakeScheduler.dequeue")(() => Effect.succeed(true)),
      kick: record("kick"),
      releaseSlot: Effect.fn("fakeScheduler.release")((id) => record(`release:${id}`)),
      setMaxConcurrency: Effect.fn("fakeScheduler.max")((n) => record(`max:${n}`)),
      setMaxConcurrentDownloads: Effect.fn("fakeScheduler.downloads")((n) => record(`downloads:${n}`)),
      setMaxPerGroup: Effect.fn("fakeScheduler.group")((key, n) => record(`group:${key}:${n}`)),
      sweepDeadSlots: Effect.fn("fakeScheduler.sweep")(() => record("sweep")),
      stats: Effect.succeed({ capacity: 7, running: 0, queued: 0, perGroup: {} }),
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
    sink = nextSink;
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
  it.effect("process boundary models reject malformed numeric identities", () =>
    Effect.sync(() => {
      expect(Option.isNone(S.decodeOption(ClockTickRate)(Number.NaN))).toBe(true);
      expect(
        Option.isNone(
          S.decodeOption(LinuxProcessIdentity)({ bootTimeSeconds: 1000, starttimeTicks: Number.POSITIVE_INFINITY })
        )
      ).toBe(true);
      expect(Option.isSome(S.decodeOption(LinuxProcessIdentity)({ bootTimeSeconds: 1000, starttimeTicks: 250 }))).toBe(
        true
      );
    })
  );

  it.effect("queue uses all supplied operation services and binds dispatch callbacks", () =>
    Effect.gen(function* () {
      const queue = yield* TaskQueue;
      const persistence = yield* TaskPersistence;
      yield* persistence.insertTask(task("injected-retry", { status: "retry-scheduled", nextRetryAt: 5000 }));
      yield* queue.start;
      expect(calls).toContain("reconcile");
      expect(calls).toContain("retry:injected-retry:5000");
      yield* queue.add({ id: "injected-run", input: { kind: "video", url: "https://example.com/injection" } });
      expect(calls).toContain("enqueue:injected-run");
      expect(calls).toContain("spawn:injected-run:42");
      expect(calls).toContain("arm:injected-run:running");
      yield* queue.setMaxConcurrency(3);
      expect(calls).toContain("max:3");
      const stats = yield* queue.stats;
      expect(stats.capacity).toBe(7);
      expect(sink).toBeDefined();
      if (sink !== undefined)
        yield* sink.emit({
          type: "finish",
          taskId: "injected-run",
          attemptId: "injection-attempt",
          closedAt: 1001,
          stdoutTail: "",
          stderrTail: "",
          result: {
            type: "success",
            output: { filePath: "/fixture/output.mp4", size: 1, durationMs: null, sha256: null },
          },
        });
      yield* Effect.yieldNow;
      expect(calls).toContain("disarm:injected-run");
      expect(calls).toContain("close:injected-run");
      expect(calls).toContain("release:injected-run");
      const finished = yield* queue.get("injected-run");
      expect(finished?.status).toBe("completed");
      yield* queue.stop;
      expect(calls).toContain("retry-stop");
    })
  );
});
