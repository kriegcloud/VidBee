import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import { CaptureTimersLive } from "../src/CaptureTimers.driver.js";
import { CaptureTimers } from "../src/CaptureTimers.service.js";

layer(CaptureTimersLive)("native capture timer ownership", (it) => {
  it.effect("referenced after action runs on the clock and cancellation prevents a later action", () =>
    Effect.gen(function* () {
      const timers = yield* CaptureTimers;
      const trace: string[] = [];
      const firstCancel = yield* timers.after(
        1000,
        Effect.sync(() => {
          trace.push("fired");
        }),
        { keepAlive: true }
      );
      const cancel = yield* timers.after(
        2000,
        Effect.sync(() => {
          trace.push("cancelled");
        }),
        { keepAlive: true }
      );
      yield* TestClock.adjust(1000);
      expect(trace).toEqual(["fired"]);
      yield* firstCancel;
      yield* cancel;
      yield* TestClock.adjust(2000);
      expect(trace).toEqual(["fired"]);
    })
  );
  it.effect("unsupported unreferenced native scheduling fails explicitly without running the action", () =>
    Effect.gen(function* () {
      const timers = yield* CaptureTimers;
      let fired = false;
      const result = yield* Effect.result(
        timers.after(
          1,
          Effect.sync(() => {
            fired = true;
          }),
          { keepAlive: false }
        )
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure._tag).toBe("CaptureUnavailable");
      yield* TestClock.adjust(10);
      expect(fired).toBe(false);
    })
  );
});
