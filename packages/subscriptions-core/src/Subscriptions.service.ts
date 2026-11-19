import * as Context from "effect/Context";
import type { TaskCreationMetadata } from "@vidbee/task-queue/Task.model";
import type * as F from "./Feed.model.js";
import type * as M from "./Subscription.model.js";
import type { SubscriptionChangedSink, Unsubscribe } from "./SubscriptionEvents.service.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export class Subscriptions extends Context.Service<
  Subscriptions,
  {
    readonly start: Operation<void>;
    readonly stop: Operation<void>;
    readonly isLeader: Operation<boolean>;
    readonly observeLeader: Operation<M.LeaderState>;
    readonly resolve: (input: { rawUrl: string }) => Operation<M.ResolvedFeed>;
    readonly list: Operation<{ items: F.StoredSubscriptionWithItems[]; total: number }>;
    readonly get: (input: { id: string }) => Operation<F.StoredSubscriptionWithItems>;
    readonly add: (input: M.SubscriptionCreateInput) => Operation<F.StoredSubscriptionWithItems>;
    readonly update: (input: { id: string } & M.SubscriptionUpdateInput) => Operation<F.SubscriptionMutationResult>;
    readonly remove: (input: { id: string }) => Operation<Record<string, never>>;
    readonly refresh: (input: { id: string }) => Operation<F.StoredSubscriptionWithItems>;
    readonly itemsList: (input: {
      subscriptionId: string;
      limit?: number | undefined;
      offset?: number | undefined;
    }) => Operation<{ items: M.SubscriptionFeedItem[]; total: number }>;
    readonly itemsQueue: (
      input: { subscriptionId: string; itemId: string },
      creation?: TaskCreationMetadata
    ) => Operation<{ queued: boolean; taskId: string | null }>;
    readonly releaseRemovedTasks: (ids: readonly string[]) => Operation<number>;
    readonly reconcileOrphanedTasks: Operation<number>;
    readonly refreshAll: (options?: { force?: boolean | undefined }) => Operation<void>;
    readonly refreshOne: (id: string) => Operation<void>;
    readonly noteTaskRemoved: (id: string) => Operation<void>;
    readonly on: (sink: SubscriptionChangedSink) => import("effect/Effect").Effect<Unsubscribe>;
  }
>()("@vidbee/subscriptions-core/Subscriptions.service/Subscriptions") {}
