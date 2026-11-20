import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Cause from "effect/Cause";

// Listener turns and voided Promises had distinct process-level delivery in the
// host. Native compositions log and continue; compatibility restores that delivery.
export const DetachedFailures = Context.Reference<{
  readonly listener: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
  readonly rejection: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
}>("@vidbee/transcription/DetachedFailures", {
  defaultValue: () => ({ listener: Effect.logError, rejection: Effect.logError }),
});
