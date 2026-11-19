import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Subscriptions.errors.js";
export class SubscriptionDates extends Context.Service<
  SubscriptionDates,
  {
    readonly parse: (value: unknown) => Effect.Effect<number | null, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionDates.service/SubscriptionDates") {}
