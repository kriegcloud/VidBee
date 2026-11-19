import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CheckCancellation } from "./CheckCancellation.service.js";
import { FeedCancellation } from "./FeedCancellation.service.js";

const make = Effect.fnUntraced(function* () {
  const cancellation = yield* FeedCancellation;
  return {
    make: Effect.map(cancellation.make, (owned) => ({
      cancellation: owned.token,
      aborted: Effect.map(owned.token.snapshot, (state) => state.aborted),
      cancel: Effect.suspend(() => owned.abort(new DOMException("This operation was aborted", "AbortError"))),
    })),
  };
});
export const CheckCancellationLive = Layer.effect(CheckCancellation, make());
