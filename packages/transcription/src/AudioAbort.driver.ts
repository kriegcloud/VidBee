import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { AudioAbort } from "./Audio.service.js";
import type { HostFailure } from "./Transcription.errors.js";
export const AudioAbortLive = Layer.succeed(AudioAbort, {
  subscribe: Effect.fn("AudioAbort.subscribe")(function* (
    signal: AbortSignal,
    action: Effect.Effect<void, HostFailure>
  ) {
    const scope = yield* Effect.scope;
    const observed = Effect.callback<void>((resume) => {
      const listener = () => resume(Effect.void);
      signal.addEventListener("abort", listener, { once: true });
      return Effect.sync(() => signal.removeEventListener("abort", listener));
    });
    const fiber = yield* observed.pipe(Effect.andThen(action), Effect.forkIn(scope));
    return yield* fiber.pipe(Fiber.interrupt, Effect.asVoid, Effect.succeed);
  }),
});
