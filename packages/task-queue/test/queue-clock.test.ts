import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { layer as timerLayer } from "../src/QueueTimers.layer.js";
import { QueueTimers } from "../src/QueueTimers.service.js";

layer(timerLayer)((it) => {
  it.effect("native timers honor clock deadlines and cancellation", () =>
    Effect.gen(function* () {
      const timers = yield* QueueTimers;
      let fired = 0;
      const cancel = yield* timers.after(
        100,
        Effect.sync(() => {
          fired++;
        }),
        { keepAlive: false }
      );
      yield* cancel;
      yield* TestClock.adjust(100);
      expect(fired).toBe(0);
      const cancelSecond = yield* timers.after(
        50,
        Effect.sync(() => {
          fired++;
        }),
        { keepAlive: true }
      );
      yield* TestClock.adjust(49);
      expect(fired).toBe(0);
      yield* TestClock.adjust(1);
      expect(fired).toBe(1);
      yield* cancelSecond;
    })
  );
  it.effect("native timer sleep follows TestClock", () =>
    Effect.gen(function* () {
      const timers = yield* QueueTimers;
      let finished = false;
      const fiber = yield* timers.sleep(25).pipe(
        Effect.andThen(
          Effect.sync(() => {
            finished = true;
          })
        ),
        Effect.forkChild({ startImmediately: true })
      );
      yield* TestClock.adjust(24);
      expect(finished).toBe(false);
      yield* TestClock.adjust(1);
      yield* Fiber.join(fiber);
      expect(finished).toBe(true);
    })
  );
});
