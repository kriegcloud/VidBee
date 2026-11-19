import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import { SubscriptionDates } from "./SubscriptionDates.service.js";
import { HostFailure } from "./Subscriptions.errors.js";
/** String dates use the public decoder; raw values retain Date.parse's string coercion. */
export const SubscriptionDatesLive = Layer.succeed(SubscriptionDates, {
  parse: Effect.fn("SubscriptionDates.parse")((value: unknown) =>
    Effect.try({
      try: () => {
        if (typeof value === "string") {
          const parsed = S.decodeResult(S.DateFromString)(value);
          return Result.isSuccess(parsed) ? parsed.success.getTime() : null;
        }
        const parsed = Date.parse(`${value}`);
        return Number.isNaN(parsed) ? null : parsed;
      },
      catch: (original) =>
        HostFailure.make({ original, legacyMessage: original instanceof Error ? original.message : String(original) }),
    })
  ),
});
