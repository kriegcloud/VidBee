import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { dual } from "effect/Function";
// Capture the body's Exit so a failing JavaScript-style finally replaces it,
// rather than combining the body failure with the cleanup failure.
export const withLegacyFinally: {
  <A, E, R, E2, R2>(
    body: Effect.Effect<A, E, R>,
    cleanup: Effect.Effect<void, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>;
  <E2, R2>(
    cleanup: Effect.Effect<void, E2, R2>
  ): <A, E, R>(body: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>;
} = dual(
  2,
  <A, E, R, E2, R2>(
    body: Effect.Effect<A, E, R>,
    cleanup: Effect.Effect<void, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> =>
    Effect.flatMap(
      Effect.onExit(Effect.exit(body), () => cleanup),
      (exit) => (Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause))
    )
);
