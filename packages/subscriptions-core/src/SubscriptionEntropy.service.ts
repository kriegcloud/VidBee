import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Subscriptions.errors.js";
export class SubscriptionEntropy extends Context.Service<
  SubscriptionEntropy,
  {
    readonly subscriptionId: Effect.Effect<string, HostFailure>;
    readonly leaseId: Effect.Effect<string, HostFailure>;
    readonly next: Effect.Effect<number, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionEntropy.service/SubscriptionEntropy") {}
