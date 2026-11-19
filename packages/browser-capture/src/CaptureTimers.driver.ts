import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { CaptureUnavailable } from "./Capture.errors.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import type { CaptureError } from "./Capture.errors.js";
import type { Cancel } from "./CaptureTimers.service.js";
export const CaptureTimersLive = Layer.effect(
  CaptureTimers,
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    return CaptureTimers.of({
      now: Clock.currentTimeMillis,
      sleep: Effect.fn("CaptureTimers.sleep")((ms) => Effect.sleep(ms)),
      defer: Effect.fn("CaptureTimers.defer")((action) => Effect.forkIn(action, scope).pipe(Effect.asVoid)),
      after: Effect.fn("CaptureTimers.after")((ms, action, options): Effect.Effect<Cancel, CaptureError> => {
        if (!options.keepAlive)
          return Effect.fail(
            CaptureUnavailable.make({
              operation: "timer",
              legacyMessage: "Native unreferenced capture timers are unavailable",
            })
          );
        return Effect.forkIn(Effect.sleep(ms).pipe(Effect.andThen(action)), scope, { startImmediately: true }).pipe(
          Effect.map((fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid))
        );
      }),
    });
  })
);
