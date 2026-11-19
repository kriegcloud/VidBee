import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SubscriptionLog } from "./SubscriptionLog.service.js";
import { HostFailure } from "./Subscriptions.errors.js";
export const layer = Layer.succeed(
  SubscriptionLog,
  SubscriptionLog.of({
    write: Effect.fn("SubscriptionLog.write")((level, message, metadata, cause) => {
      const observation = { message, metadata, cause };
      const logging =
        level === "info"
          ? Effect.logInfo(observation)
          : level === "warn"
            ? Effect.logWarning(observation)
            : Effect.logError(observation);
      return logging.pipe(
        Effect.catchCause((failure) => {
          const original = Cause.squash(failure);
          return Effect.fail(
            HostFailure.make({
              original,
              legacyMessage: original instanceof Error ? original.message : String(original),
            })
          );
        })
      );
    }),
  })
);
