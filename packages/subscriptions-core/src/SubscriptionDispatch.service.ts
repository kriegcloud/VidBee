import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Operation } from "./SubscriptionTimers.service.js";
export class SubscriptionDispatch extends Context.Service<
  SubscriptionDispatch,
  {
    readonly detach: (operation: Operation<void>) => Effect.Effect<void>;
  }
>()("@vidbee/subscriptions-core/SubscriptionDispatch.service/SubscriptionDispatch") {}
