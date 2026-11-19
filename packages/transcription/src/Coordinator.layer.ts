import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { TRANSCRIBABLE_TASK_KINDS } from "@vidbee/task-queue/types";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { Coordinator, CoordinatorHooks } from "./Coordinator.service.js";
import { Enqueue } from "./Enqueue.service.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionQueue } from "./TranscriptionQueue.service.js";
import { TranscriptionRecords } from "./TranscriptionRecords.service.js";
import type { Task } from "@vidbee/task-queue/Task.model";
import type { EnqueueError } from "./Enqueue.service.js";
import type { TranscriptionQueueSubscription } from "./TranscriptionQueue.service.js";
export const layer = Layer.effect(
  Coordinator,
  Effect.gen(function* () {
    const queue = yield* TranscriptionQueue;
    const records = yield* TranscriptionRecords;
    const files = yield* TranscriptionFiles;
    const enqueue = yield* Enqueue;
    const hooks = yield* CoordinatorHooks;
    const timing = yield* LegacyTiming;
    const owner = yield* Effect.scope;
    let subscription: TranscriptionQueueSubscription | null = null;
    let pending = HashSet.empty<string>();
    let ordered: string[] = [];
    const removePending = (id: string) => {
      pending = HashSet.remove(pending, id);
      ordered = Arr.filter(ordered, (value) => value !== id);
    };
    const consider: (task: Readonly<Task>) => Effect.Effect<void, EnqueueError> = Effect.fn("Coordinator.consider")(
      function* (task) {
        const source = yield* hooks.source(task);
        if (source === null || source === "" || !(yield* files.exists(source)) || (yield* files.stat(source)).size <= 0)
          return;
        if ((yield* records.latest(task.id)) !== null) {
          removePending(task.id);
          return;
        }
        if (hooks.importCaptions !== undefined) {
          const imported = yield* hooks
            .importCaptions({
              downloadTaskId: task.id,
              sourceFilePath: source,
              ...(task.input.title === undefined ? {} : { title: task.input.title }),
            })
            .pipe(Effect.catch((error) => hooks.warn("caption import failed", error).pipe(Effect.as(false))));
          if (imported) {
            removePending(task.id);
            return;
          }
        }
        if (subscription === null || (yield* queue.get(task.id))?.status !== "completed") {
          removePending(task.id);
          return;
        }
        if ((yield* records.latest(task.id)) !== null || !(yield* hooks.enabled)) {
          removePending(task.id);
          return;
        }
        if (hooks.modelsReady !== undefined && !(yield* hooks.modelsReady)) {
          if (!HashSet.has(pending, task.id)) {
            pending = HashSet.add(pending, task.id);
            ordered.push(task.id);
          }
          return;
        }
        removePending(task.id);
        yield* hooks.enqueueInput(task, source).pipe(
          Effect.flatMap(enqueue.enqueue),
          Effect.asVoid,
          Effect.catch((error) => hooks.warn("auto-transcription enqueue failed", error))
        );
      }
    );
    const stop = Effect.suspend(() =>
      (subscription === null ? Effect.void : subscription.unsubscribe).pipe(
        Effect.andThen(
          Effect.sync(() => {
            subscription = null;
            pending = HashSet.empty();
            ordered = [];
          })
        )
      )
    );
    yield* Scope.addFinalizer(owner, stop);
    return Coordinator.of({
      start: Effect.gen(function* () {
        if (subscription !== null) return;
        subscription = yield* queue.subscribe({
          emit: Effect.fn("Coordinator.event")(function* (event) {
            if (event.type !== "transition" || event.to !== "completed") return;
            yield* Effect.gen(function* () {
              const task = yield* queue.get(event.taskId);
              if (task === undefined || !HashSet.has(TRANSCRIBABLE_TASK_KINDS, task.kind)) return;
              yield* consider(task);
            }).pipe(
              Effect.catch((error) => Effect.logError("auto-transcription event failed", error)),
              Effect.forkIn(owner, { startImmediately: true })
            );
          }),
        });
      }),
      stop,
      flushPending: Effect.gen(function* () {
        const ids = ordered;
        ordered = [];
        pending = HashSet.empty();
        for (const id of ids) {
          const task = yield* queue.get(id);
          if (task !== undefined) {
            yield* consider(task);
            yield* timing.turn("coordinator.flush.consider");
          }
        }
      }),
    });
  })
);
