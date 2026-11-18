import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { QueueTimers } from "./QueueTimers.service.js";
export const layer = Layer.effect(
  QueueTimers,
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    return QueueTimers.of({
      now: Clock.currentTimeMillis,
      sleep: Effect.fn("QueueTimers.sleep")((ms) => Effect.sleep(ms)),
      after: Effect.fn("QueueTimers.after")((ms, effect) =>
        Effect.sleep(ms).pipe(
          Effect.andThen(effect),
          Effect.forkIn(scope),
          Effect.map((fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid))
        )
      ),
    });
  })
);
