import * as Context from "effect/Context";
import type { CheckToken } from "./CheckCancellation.service.js";
import type { StoredSubscriptionRule } from "./Feed.model.js";
import type { ProfileCheckResult } from "./Subscription.model.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export class ProfileFeed extends Context.Service<
  ProfileFeed,
  {
    readonly configured: boolean;
    readonly available: boolean;
    readonly fetch: (subscription: StoredSubscriptionRule, token: CheckToken) => Operation<ProfileCheckResult>;
  }
>()("@vidbee/subscriptions-core/ProfileFeed.service/ProfileFeed") {}
