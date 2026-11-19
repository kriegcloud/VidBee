import * as Context from "effect/Context";
import type { FeedProbe, InterpretableFeed } from "./Feed.model.js";
import type { FeedCancellationToken } from "./FeedCancellation.service.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export class SubscriptionFeed extends Context.Service<
  SubscriptionFeed,
  {
    readonly fetch: (url: string, cancellation?: FeedCancellationToken) => Operation<InterpretableFeed>;
    readonly probe: (url: string, cancellation?: FeedCancellationToken) => Operation<FeedProbe>;
  }
>()("@vidbee/subscriptions-core/SubscriptionFeed.service/SubscriptionFeed") {}
