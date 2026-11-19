import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { SubscriptionDispatch } from "./SubscriptionDispatch.service.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
export const layer = Layer.effect(
  SubscriptionTimers,
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const dispatch = yield* SubscriptionDispatch;
    return SubscriptionTimers.of({
      now: Clock.currentTimeMillis,
      after: Effect.fn("SubscriptionTimers.after")((ms, command) =>
        Effect.sleep(ms).pipe(
          Effect.andThen(dispatch.detach(command.run)),
          Effect.forkIn(scope, { startImmediately: true }),
          Effect.map((fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid))
        )
      ),
      every: Effect.fn("SubscriptionTimers.every")((ms, command) =>
        Effect.flatMap(Clock.currentTimeMillis, (started) => {
          let next = started + ms;
          const tick = Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            yield* Effect.sleep(Math.max(0, next - now));
            next += ms;
            yield* dispatch.detach(command.run);
          });
          return tick.pipe(
            Effect.forever,
            Effect.forkIn(scope, { startImmediately: true }),
            Effect.map((fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid))
          );
        })
      ),
    });
  })
);
