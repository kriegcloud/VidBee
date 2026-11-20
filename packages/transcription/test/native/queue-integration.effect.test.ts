import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { OutputProbe } from "@vidbee/task-queue/OutputProbe.service";
import { ProcessControl } from "@vidbee/task-queue/ProcessControl.service";
import { QueueRandom } from "@vidbee/task-queue/QueueRandom.service";
import { layer as timerLayer } from "@vidbee/task-queue/QueueTimers.layer";
import { layer as admissionLayer } from "@vidbee/task-queue/SourceAdmission.layer";
import { layer as eventLayer } from "@vidbee/task-queue/TaskEvents.layer";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import { layerMemory } from "@vidbee/task-queue/TaskPersistence.layer";
import { TaskPersistence } from "@vidbee/task-queue/TaskPersistence.service";
import { internalLayers, layer as nativeQueueLayer } from "@vidbee/task-queue/TaskQueue.layer";
import { TaskQueue } from "@vidbee/task-queue/TaskQueue.service";
import { layer as storeLayer } from "@vidbee/task-queue/TaskStore.layer";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import { layer as adapterLayer } from "../../src/TranscriptionQueue.layer.js";
import { TranscriptionQueue } from "../../src/TranscriptionQueue.service.js";
import type { ExecutorContext } from "@vidbee/task-queue/Executor.model";
import type { ExecutorSink } from "@vidbee/task-queue/TaskExecutor.service";

class QueueFixture extends Context.Service<
  QueueFixture,
  {
    readonly native: typeof TaskQueue.Service;
    readonly adapter: typeof TranscriptionQueue.Service;
    readonly persistence: typeof TaskPersistence.Service;
    readonly runs: readonly string[];
    readonly cancelled: readonly string[];
    readonly childAdapter: Effect.Effect<{
      readonly adapter: typeof TranscriptionQueue.Service;
      readonly close: Effect.Effect<void>;
    }>;
  }
>()("@vidbee/transcription/test/native/queue-integration.effect.test/QueueFixture") {}
const fixture = Layer.effect(
  QueueFixture,
  Effect.gen(function* () {
    let nextId = 0;
    const runs: string[] = [];
    const cancelled: string[] = [];
    const executor = Layer.succeed(TaskExecutor, {
      run: Effect.fn("fixture.executor")(function* (context: ExecutorContext, sink: ExecutorSink) {
        runs.push(context.taskId);
        const finish = sink.emit({
          type: "finish",
          taskId: context.taskId,
          attemptId: context.attemptId,
          closedAt: 1001,
          stdoutTail: "",
          stderrTail: "",
          result: { type: "cancelled" },
        });
        return {
          cancel: Effect.fn("fixture.cancel")(() =>
            Effect.sync(() => {
              cancelled.push(context.taskId);
            }).pipe(Effect.andThen(finish))
          ),
          pause: finish,
        };
      }),
    });
    const host = Layer.mergeAll(
      storeLayer,
      eventLayer,
      layerMemory,
      timerLayer,
      admissionLayer,
      LegacyTiming.layer,
      executor,
      Layer.succeed(QueueRandom, { uuid: Effect.sync(() => `queue-id-${nextId++}`), next: Effect.succeed(0) }),
      Layer.succeed(OutputProbe, { filePresent: Effect.fn("fixture.filePresent")(() => Effect.succeed(true)) }),
      Layer.succeed(ProcessControl, {
        kill: Effect.fn("fixture.kill")(() => Effect.die("No OS process should be signalled")),
        isAlive: Effect.fn("fixture.isAlive")(() => Effect.succeed(false)),
        startTime: Effect.fn("fixture.startTime")(() => Effect.succeed(null)),
      })
    );
    const options = { idleQueueKickMs: 0, maxConcurrency: 2, sourceAdmission: false };
    const internals = internalLayers(options).pipe(Layer.provideMerge(host));
    const queueLayer = nativeQueueLayer(options).pipe(Layer.provideMerge(internals));
    const scope = yield* Effect.scope;
    const context = yield* Layer.buildWithScope(adapterLayer.pipe(Layer.provideMerge(queueLayer)), scope);
    const native = Context.get(context, TaskQueue);
    yield* native.start;
    yield* Scope.addFinalizer(scope, native.stop.pipe(Effect.ignore));
    const childAdapter = Effect.gen(function* () {
      const childScope = yield* Scope.fork(scope);
      const built = yield* Layer.buildWithScope(
        adapterLayer.pipe(Layer.provide(Layer.succeed(TaskQueue, native))),
        childScope
      );
      return { adapter: Context.get(built, TranscriptionQueue), close: Scope.close(childScope, Exit.void) };
    });
    return {
      native,
      adapter: Context.get(context, TranscriptionQueue),
      persistence: Context.get(context, TaskPersistence),
      runs,
      cancelled,
      childAdapter,
    };
  })
);
layer(fixture, { buildPerTest: true })("native queue adapter over actual memory-persisted TaskQueue", (it) => {
  it.effect(
    "shares same-key admission and original readers, supports different keys and reentrant cancellation retry",
    () =>
      Effect.gen(function* () {
        const f = yield* QueueFixture;
        const same = yield* Effect.all(
          [
            f.adapter.add({ id: "same", input: { kind: "video", url: "https://fixture.invalid/same" } }),
            f.adapter.add({ id: "duplicate", input: { kind: "video", url: "https://fixture.invalid/same" } }),
          ],
          { concurrency: "unbounded" }
        );
        expect(Arr.map(same, (row) => row.id)).toEqual(["same", "same"]);
        yield* f.adapter.add({ id: "different", input: { kind: "video", url: "https://fixture.invalid/different" } });
        const read = yield* f.adapter.get("same");
        const nativeRead = yield* f.native.get("same");
        expect(read).toBe(nativeRead);
        const listed = yield* f.adapter.list();
        expect(listed.tasks).toHaveLength(2);
        expect(Arr.findFirst(listed.tasks, (row) => row.id === "same").pipe(Option.getOrUndefined)).toBe(read);
        const retried = yield* Deferred.make<void>();
        let count = 0;
        let reenter = true;
        const subscription = yield* f.adapter.subscribe({
          emit: Effect.fn("fixture.event")(function* (event) {
            count++;
            if (event.type === "transition" && event.taskId === "same" && event.to === "cancelled" && reenter) {
              reenter = false;
              const current = yield* f.adapter.get("same").pipe(Effect.orDie);
              expect(current?.status).toBe("cancelled");
              yield* f.adapter.retryManual("same").pipe(Effect.orDie);
            }
            if (
              event.type === "transition" &&
              event.taskId === "same" &&
              event.from === "cancelled" &&
              event.to === "queued"
            )
              yield* Deferred.succeed(retried, undefined);
          }),
        });
        yield* f.adapter.cancel("same", "user");
        yield* Deferred.await(retried);
        const afterRetry = yield* f.native.get("same");
        expect(afterRetry?.status).toBe("running");
        const persisted = yield* f.persistence.loadAllTasks;
        expect(Arr.findFirst(persisted, (row) => row.id === "same").pipe(Option.getOrUndefined)?.status).toBe(
          "running"
        );
        yield* subscription.unsubscribe;
        const before = count;
        yield* f.adapter.cancel("different", "user");
        yield* Effect.yieldNow;
        expect(count).toBe(before);
      })
  );
  it.effect("cancel and retry re-enter the same running owner and queue stop reaches actual executor handles", () =>
    Effect.gen(function* () {
      const f = yield* QueueFixture;
      yield* f.native.start;
      yield* f.adapter.add({ id: "running", input: { kind: "video", url: "https://fixture.invalid/running" } });
      const running = yield* f.adapter.get("running");
      expect(running?.status).toBe("running");
      yield* f.adapter.cancel("running", "user");
      const cancelled = yield* f.native.get("running");
      expect(cancelled?.status).toBe("cancelled");
      yield* f.adapter.retryManual("running");
      const retried = yield* f.adapter.get("running");
      expect(retried?.status).toBe("running");
      expect(f.runs).toEqual(["running", "running"]);
      yield* f.native.stop;
      expect(f.cancelled).toEqual(["running", "running"]);
      const stopped = yield* f.adapter.get("running");
      expect(stopped?.status).toBe("cancelled");
    })
  );
  it.effect("closing only the adapter scope removes its listener while the borrowed queue remains usable", () =>
    Effect.gen(function* () {
      const f = yield* QueueFixture;
      const child = yield* f.childAdapter;
      const seen = yield* Deferred.make<void>();
      let count = 0;
      yield* child.adapter.subscribe({
        emit: Effect.fn("fixture.childEvent")(function* (event) {
          count++;
          if (event.type === "snapshot-changed" && event.taskId === "before") yield* Deferred.succeed(seen, undefined);
        }),
      });
      yield* f.adapter.add({ id: "before", input: { kind: "video", url: "https://fixture.invalid/before" } });
      yield* Deferred.await(seen);
      yield* child.close;
      const before = count;
      yield* f.adapter.add({ id: "after", input: { kind: "video", url: "https://fixture.invalid/after" } });
      yield* Effect.yieldNow;
      expect(count).toBe(before);
      const after = yield* f.native.get("after");
      expect(after?.status).toBe("running");
    })
  );
});
