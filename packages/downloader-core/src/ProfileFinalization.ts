import * as Effect from "effect/Effect";
import { dual } from "effect/Function";

/** Match async finally: cleanup is uninterruptible and its failure replaces the body's failure. */
export const finalizeProfile: {
  <E2, R2>(
    cleanup: Effect.Effect<void, E2, R2>
  ): <A, E, R>(work: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>;
  <A, E, R, E2, R2>(
    work: Effect.Effect<A, E, R>,
    cleanup: Effect.Effect<void, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>;
} = dual(
  2,
  <A, E, R, E2, R2>(
    work: Effect.Effect<A, E, R>,
    cleanup: Effect.Effect<void, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.flatMap(Effect.exit(restore(work)), (exit) => Effect.andThen(cleanup, exit))
    )
);
