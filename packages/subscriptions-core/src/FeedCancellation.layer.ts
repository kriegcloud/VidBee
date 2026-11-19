import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import { FeedCancellation } from "./FeedCancellation.service.js";
import { FeedCancelled } from "./Subscriptions.errors.js";
import type { AbortNoticeSink, OwnedFeedCancellation } from "./FeedCancellation.service.js";

/** Owned cancellation records the first reason, including undefined and other falsy values. */
export const makeFeedCancellation: Effect.Effect<OwnedFeedCancellation> = Effect.sync(() => {
  let aborted = false;
  let reason: unknown;
  let nextId = 0;
  let sinks: Array<{ readonly id: number; readonly sink: AbortNoticeSink }> = [];
  const snapshot = Effect.sync(() => ({ aborted, reason }));
  const check = Effect.flatMap(snapshot, (state) =>
    state.aborted ? Effect.fail(FeedCancelled.make({ reason: state.reason })) : Effect.void
  );
  return {
    token: {
      snapshot,
      check,
      subscribe: (sink) =>
        Effect.suspend(() => {
          const id = nextId++;
          if (aborted) return Effect.as(sink.emit(reason), Effect.succeed(false));
          sinks.push({ id, sink });
          return Effect.succeed(
            Effect.sync(() => {
              const before = sinks.length;
              sinks = Arr.filter(sinks, (entry) => entry.id !== id);
              return before !== sinks.length;
            })
          );
        }),
    },
    abort: Effect.fnUntraced(function* (value: unknown) {
      if (aborted) return;
      aborted = true;
      reason = value;
      // Read the live registry so an earlier observer can unsubscribe a later observer.
      let cursor = -1;
      for (;;) {
        const entry = O.getOrUndefined(Arr.findFirst(sinks, (candidate) => candidate.id > cursor));
        if (entry === undefined) break;
        cursor = entry.id;
        yield* entry.sink.emit(reason);
      }
    }),
    dispose: Effect.sync(() => {
      sinks = [];
    }),
  };
});
export const FeedCancellationLive = Layer.succeed(FeedCancellation, { make: makeFeedCancellation });
