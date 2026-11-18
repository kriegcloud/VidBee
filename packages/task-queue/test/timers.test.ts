import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as M from "effect/MutableHashMap";
import { make as makeWatchdog } from "../src/process/Watchdog.layer.js";
import { QueueTimers } from "../src/QueueTimers.service.js";
import { make as makeRetry } from "../src/scheduler/RetryScheduler.layer.js";

const recording = () => {
  let now = 0;
  let created = 0;
  const pending = M.empty<number, { ms: number; effect: Effect.Effect<void> }>();
  const timers = QueueTimers.of({
    now: Effect.sync(() => now),
    sleep: Effect.fn("test.sleep")(() => Effect.void),
    after: Effect.fn("test.after")((ms, effect) =>
      Effect.sync(() => {
        const id = created++;
        M.set(pending, id, { ms, effect });
        return Effect.sync(() => {
          M.remove(pending, id);
        });
      })
    ),
  });
  return {
    timers,
    pending,
    created: () => created,
    setNow: (value: number) => {
      now = value;
    },
    fire: Effect.suspend(() => {
      const item = Array.from(pending)[0];
      if (item === undefined) return Effect.die("No pending timer");
      M.remove(pending, item[0]);
      return item[1].effect;
    }),
    nextMs: () => Array.from(M.values(pending))[0]?.ms,
  };
};
const retryTimers = recording();
retryTimers.setNow(100);
layer(Layer.succeed(QueueTimers)(retryTimers.timers))((it) => {
  it.effect("retry stop survives an in-flight failing tick", () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const retry = yield* makeRetry(() => Deferred.await(gate).pipe(Effect.andThen(Effect.fail("fixture failure"))));
      yield* retry.enqueue("one", 100);
      const tick = yield* retry.tick.pipe(Effect.forkChild({ startImmediately: true }));
      yield* retry.stop;
      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(tick);
      expect(M.size(retryTimers.pending)).toBe(0);
      const size = yield* retry.size;
      expect(size).toBe(0);
    })
  );
  it.effect("retry ticks coalesce while callbacks are pending", () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const calls: string[] = [];
      const retry = yield* makeRetry(
        Effect.fn("test.onDue")((id) =>
          Effect.sync(() => {
            calls.push(id);
          }).pipe(Effect.andThen(Deferred.await(gate)))
        )
      );
      yield* retry.enqueue("one", 100);
      yield* retry.enqueue("two", 100);
      const first = yield* retry.tick.pipe(Effect.forkChild({ startImmediately: true }));
      const second = yield* retry.tick.pipe(Effect.forkChild({ startImmediately: true }));
      expect(calls).toEqual(["one"]);
      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);
      yield* retry.stop;
      expect(calls).toEqual(["one", "two"]);
    })
  );
});
const burst = recording();
layer(Layer.succeed(QueueTimers)(burst.timers))((it) => {
  it.effect("watchdog coalesces progress bursts and expires at the last activity deadline", () =>
    Effect.gen(function* () {
      const stalled: string[] = [];
      const watchdog = yield* makeWatchdog(
        (id) =>
          Effect.sync(() => {
            stalled.push(id);
          }),
        { runningIdleMs: 100, processingIdleMs: 1000 }
      );
      yield* watchdog.arm("one", "running");
      for (let i = 0; i < 10000; i++) {
        burst.setNow(50);
        yield* watchdog.bump("one");
      }
      expect(burst.created()).toBe(1);
      burst.setNow(100);
      yield* burst.fire;
      expect(stalled).toEqual([]);
      expect(burst.nextMs()).toBe(50);
      burst.setNow(150);
      yield* burst.fire;
      expect(stalled).toEqual(["one"]);
    })
  );
});
const grace = recording();
layer(Layer.succeed(QueueTimers)(grace.timers))((it) => {
  it.effect("watchdog clears zero-valued handles and honors processing grace", () =>
    Effect.gen(function* () {
      let stalled = 0;
      const watchdog = yield* makeWatchdog(
        () =>
          Effect.sync(() => {
            stalled++;
          }),
        { runningIdleMs: 100, processingIdleMs: 1000 }
      );
      yield* watchdog.arm("one", "running");
      yield* watchdog.disarm("one");
      expect(M.size(grace.pending)).toBe(0);
      yield* watchdog.arm("one", "running");
      grace.setNow(50);
      yield* watchdog.promoteToProcessing("one");
      expect(M.size(grace.pending)).toBe(1);
      expect(grace.nextMs()).toBe(1000);
      grace.setNow(1050);
      yield* grace.fire;
      expect(stalled).toBe(1);
    })
  );
});
const wait = recording();
layer(Layer.succeed(QueueTimers)(wait.timers))((it) => {
  it.effect("watchdog honors an announced server wait then resumes stall detection", () =>
    Effect.gen(function* () {
      let stalled = 0;
      const watchdog = yield* makeWatchdog(
        () =>
          Effect.sync(() => {
            stalled++;
          }),
        { runningIdleMs: 60000 }
      );
      yield* watchdog.arm("gallery", "running");
      yield* watchdog.bump("gallery", 60000);
      wait.setNow(60000);
      yield* wait.fire;
      expect(stalled).toBe(0);
      expect(wait.nextMs()).toBe(60000);
      wait.setNow(120000);
      yield* wait.fire;
      expect(stalled).toBe(1);
    })
  );
});
