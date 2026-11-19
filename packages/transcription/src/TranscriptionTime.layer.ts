import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
// Native Clock sleeps remain referenced. The compatibility layer supplies actual
// Node timer reference semantics; native process-exit parity is a cutover blocker.
export const TranscriptionTimeLive = Layer.effect(
  TranscriptionTime,
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const clock = yield* Clock.Clock;
    const readMonotonicMillis = () => Number(clock.monotonicTimeNanosUnsafe()) / 1_000_000;
    return TranscriptionTime.of({
      now: clock.currentTimeMillis,
      monotonicMillis: Effect.sync(readMonotonicMillis),
      readMonotonicMillis,
      sleep: Effect.fn("TranscriptionTime.sleep")((ms) => Effect.sleep(ms)),
      after: Effect.fn("TranscriptionTime.after")((ms, action) =>
        Effect.sleep(ms).pipe(
          Effect.andThen(action),
          Effect.tapCause(Effect.logError),
          Effect.forkIn(scope),
          Effect.map((fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid))
        )
      ),
      every: Effect.fn("TranscriptionTime.every")((ms, action) =>
        Effect.sleep(ms).pipe(
          Effect.andThen(action),
          Effect.catchCause(Effect.logError),
          Effect.forever,
          Effect.forkIn(scope),
          Effect.map((fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid))
        )
      ),
      microtask: Effect.fn("TranscriptionTime.microtask")((action) =>
        Effect.yieldNow.pipe(Effect.andThen(action), Effect.forkIn(scope), Effect.asVoid)
      ),
    });
  })
);
