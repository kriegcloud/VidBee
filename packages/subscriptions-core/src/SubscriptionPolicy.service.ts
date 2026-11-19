import * as Context from "effect/Context";
import type {
  StoredAutoDownloadDecision,
  StoredAutoDownloadInputs,
  StoredProfileDownloadInputs,
} from "./Feed.model.js";
import type { ProfileDownloadDecision } from "./Subscription.model.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export class SubscriptionPolicy extends Context.Service<
  SubscriptionPolicy,
  {
    readonly rss: (input: StoredAutoDownloadInputs) => Operation<StoredAutoDownloadDecision>;
    readonly profile: (input: StoredProfileDownloadInputs) => Operation<ProfileDownloadDecision>;
  }
>()("@vidbee/subscriptions-core/SubscriptionPolicy.service/SubscriptionPolicy") {}

// A policy callback has no JavaScript receiver; the API's second RSS history
// filter invokes the same host function as an owner method.
export class SubscriptionPolicyHistory extends Context.Service<
  SubscriptionPolicyHistory,
  {
    readonly contains: (url: unknown) => Operation<boolean>;
  }
>()("@vidbee/subscriptions-core/SubscriptionPolicy.service/SubscriptionPolicyHistory") {}
