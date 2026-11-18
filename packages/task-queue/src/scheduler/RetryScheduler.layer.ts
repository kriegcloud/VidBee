import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import { QueueTimers } from "../QueueTimers.service.js";
import { TaskQueueHooks } from "../TaskQueue.service.js";
import { MinHeap } from "../util/min-heap.js";
import { RetryScheduler } from "./RetryScheduler.service.js";
import type { Cancel } from "../QueueTimers.service.js";
export const computeBackoffMs: {
  (suggestedMs: number | null, rng: () => number): (attempt: number) => number;
  (attempt: number, suggestedMs: number | null, rng: () => number): number;
} = dual(3, (attempt: number, suggestedMs: number | null, rng: () => number): number =>
  suggestedMs != null && suggestedMs >= 0
    ? suggestedMs
    : Math.floor(rng() * Math.min(60000, 2000 * 2 ** Math.max(0, attempt)))
);
export const make = Effect.fnUntraced(function* <E>(onDue: (id: string, at: number) => Effect.Effect<void, E>) {
  const timers = yield* QueueTimers;
  const heap = new MinHeap<{ taskId: string; nextRetryAt: number; seq: number }>((a, b) =>
    a.nextRetryAt === b.nextRetryAt ? a.seq - b.seq : a.nextRetryAt - b.nextRetryAt
  );
  let timer: Cancel | null = null;
  let seq = 0;
  let generation = 0;
  let stopped = false;
  let ticking = false;
  const rearm = Effect.fnUntraced(function* (): Effect.fn.Return<void> {
    if (timer !== null) {
      yield* timer;
      timer = null;
    }
    if (stopped || ticking) return;
    const top = heap.peek();
    if (top === undefined) return;
    const now = yield* timers.now;
    timer = yield* timers.after(
      Math.max(0, top.nextRetryAt - now),
      Effect.suspend(() => {
        timer = null;
        return tick;
      }),
      { keepAlive: true }
    );
  });
  const tick = Effect.gen(function* () {
    if (stopped || ticking) return;
    ticking = true;
    const currentGeneration = generation;
    const now = yield* timers.now;
    yield* Effect.gen(function* () {
      while (!stopped && currentGeneration === generation) {
        const top = heap.peek();
        if (top === undefined || top.nextRetryAt > now) break;
        const item = heap.pop();
        if (item === undefined) break;
        yield* onDue(item.taskId, now).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              if (stopped || currentGeneration !== generation) return;
              yield* Effect.logError("task_queue_retry_tick_threw", cause);
              heap.push({ taskId: item.taskId, nextRetryAt: now + 1000, seq: ++seq });
            })
          )
        );
      }
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          ticking = false;
          return rearm();
        })
      )
    );
  });
  return RetryScheduler.of({
    enqueue: Effect.fnUntraced(function* (id, at) {
      stopped = false;
      heap.remove((item) => item.taskId === id);
      heap.push({ taskId: id, nextRetryAt: at, seq: ++seq });
      yield* rearm();
    }),
    remove: Effect.fnUntraced(function* (id) {
      const removed = heap.remove((item) => item.taskId === id);
      yield* rearm();
      return removed != null;
    }),
    tick,
    stop: Effect.gen(function* () {
      stopped = true;
      generation++;
      if (timer !== null) {
        yield* timer;
        timer = null;
      }
    }),
    size: Effect.sync(() => heap.size()),
  });
});
export const layer = <E>(onDue: (id: string, at: number) => Effect.Effect<void, E>) =>
  Layer.effect(RetryScheduler, make(onDue));

export const layerFromHooks = Layer.effect(
  RetryScheduler,
  Effect.gen(function* () {
    const hooks = yield* TaskQueueHooks;
    return yield* make(hooks.retryDue);
  })
);
