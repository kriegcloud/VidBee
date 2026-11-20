import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { withModelCleanup } from "../../src/ModelLifetime.js";
import { HostFailure } from "../../src/Transcription.errors.js";

it.effect("model cleanup failure replaces the original failure while retaining its identity", () =>
  Effect.gen(function* () {
    const original = HostFailure.make({ operation: "publish", legacyMessage: "original" });
    const cleanup = HostFailure.make({ operation: "cleanup", legacyMessage: "cleanup" });
    const result = yield* withModelCleanup(Effect.fail(original), Effect.fail(cleanup)).pipe(Effect.result);
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBe(cleanup);
  })
);
it.effect("model cleanup also runs when the owned operation is interrupted", () =>
  Effect.gen(function* () {
    let cleaned = false;
    const running = yield* withModelCleanup(
      Effect.never,
      Effect.sync(() => {
        cleaned = true;
      })
    ).pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(running);
    expect(cleaned).toBe(true);
  })
);
