import { TaskQueue } from "@vidbee/task-queue/TaskQueue.service";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import { TranscriptionQueue } from "./TranscriptionQueue.service.js";
import type { TaskQueueEvent } from "@vidbee/task-queue/Events.model";
/** Native event delivery is owned and asynchronous; raw facade delivery stays synchronous. */
export const layer = Layer.effect(
  TranscriptionQueue,
  Effect.gen(function* () {
    const queue = yield* TaskQueue;
    const owner = yield* Effect.scope;
    return TranscriptionQueue.of({
      get: queue.get,
      list: queue.list,
      add: queue.add,
      cancel: queue.cancel,
      retryManual: queue.retryManual,
      subscribe: Effect.fn("TranscriptionQueue.subscribe")(function* (sink) {
        const events = yield* Queue.unbounded<TaskQueueEvent>();
        const remove = yield* queue.subscribe((event) => {
          Queue.offerUnsafe(events, event);
        });
        const fiber = yield* Queue.take(events).pipe(
          Effect.flatMap(sink.emit),
          Effect.catch((error) => Effect.logError("auto-transcription event failed", error)),
          Effect.forever,
          Effect.forkIn(owner)
        );
        let active = true;
        const unsubscribe = Effect.suspend(() => {
          if (!active) return Effect.void;
          active = false;
          return Effect.sync(remove).pipe(Effect.andThen(Fiber.interrupt(fiber)), Effect.asVoid);
        });
        yield* Scope.addFinalizer(owner, unsubscribe);
        return { unsubscribe };
      }),
    });
  })
);
