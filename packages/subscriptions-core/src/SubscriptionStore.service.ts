import * as Context from "effect/Context";
import type { DbRowDecodeError } from "@vidbee/db";
import type * as Effect from "effect/Effect";
import type { SqlError } from "effect/sql/SqlError";
import type * as F from "./Feed.model.js";
import type * as M from "./Subscription.model.js";
import type { SubscriptionsError } from "./Subscriptions.errors.js";
export type StoreEffect<A> = Effect.Effect<A, SqlError | DbRowDecodeError | SubscriptionsError>;
export interface SubscriptionStoreShape {
  readonly add: (input: M.SubscriptionCreateInput) => StoreEffect<F.StoredSubscriptionWithItems>;
  readonly clearOrphanedQueueLinks: (isLive: (taskId: string) => StoreEffect<boolean>) => StoreEffect<number>;
  readonly clearQueueLinks: (selector: M.QueueLinkSelector) => StoreEffect<number>;
  readonly findDuplicateFeed: (feedUrl: string, ignoreId?: string) => StoreEffect<string | null>;
  readonly get: (id: string) => StoreEffect<F.StoredSubscriptionWithItems | null>;
  readonly list: StoreEffect<F.StoredSubscriptionWithItems[]>;
  readonly markItemQueued: (subscriptionId: string, itemId: string, taskId: string | null) => StoreEffect<void>;
  readonly mergeItems: (subscriptionId: string, items: M.NormalizedFeedItem[]) => StoreEffect<void>;
  readonly remove: (id: string) => StoreEffect<boolean>;
  readonly replaceItems: (subscriptionId: string, items: F.InterpretedFeedItem[]) => StoreEffect<void>;
  readonly update: (
    id: string,
    patch: F.StoredSubscriptionPatch | F.InterpretedFeedPatch
  ) => StoreEffect<F.SubscriptionMutationResult | null>;
}
export class SubscriptionStore extends Context.Service<SubscriptionStore, SubscriptionStoreShape>()(
  "@vidbee/subscriptions-core/SubscriptionStore.service/SubscriptionStore"
) {}
