import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
/** As with JavaScript finally, a cleanup failure replaces the original result. */
export const withModelCleanup: {
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
    Effect.uninterruptibleMask((restore) =>
      restore(body).pipe(
        Effect.exit,
        Effect.flatMap((exit) => cleanup.pipe(Effect.andThen(exit)))
      )
    )
);
