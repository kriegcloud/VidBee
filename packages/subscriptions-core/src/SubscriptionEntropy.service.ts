import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Subscriptions.errors.js";
export class SubscriptionEntropy extends Context.Service<
  SubscriptionEntropy,
  {
    /** Synchronous ID read at the original SQL-segment position; must not suspend.
     * A suspending host violates database access rule 2 and defects before any write. */
    readonly subscriptionId: Effect.Effect<string, HostFailure>;
    readonly leaseId: Effect.Effect<string, HostFailure>;
    readonly next: Effect.Effect<number, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionEntropy.service/SubscriptionEntropy") {}
