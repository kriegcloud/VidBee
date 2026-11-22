import * as Effect from "effect/Effect";

/** Invoke at one existing recipient-send point. Listener traversal stays with its source owner. */
export const publishRecipient = Effect.fn("Publication.recipient")(function* <A>(input: {
  readonly value: A;
  readonly legacy?: (value: A) => void;
  readonly migrated?: (value: A) => Effect.Effect<void>;
  readonly report: (cause: import("effect/Cause").Cause<never>) => Effect.Effect<void>;
}) {
  // The original exception still stops the original publisher at this point.
  if (input.legacy !== undefined) yield* Effect.sync(() => input.legacy?.(input.value));
  if (input.migrated !== undefined) yield* input.migrated(input.value).pipe(Effect.catchCause(input.report));
});
