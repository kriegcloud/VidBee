// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MetaStore } from './leader';
import type { LeaderKind, LeaderState, NormalizedFeedItem, SubscriptionCreateInput, SubscriptionRule, SubscriptionUpdateInput, SubscriptionWithItems } from './types';
/** Newest profile items attached per subscription by `list()`. */
export declare const LIST_PROFILE_ITEM_LIMIT = 300;
export interface SubscriptionsStore {
    list(): Promise<SubscriptionWithItems[]>;
    get(id: string): Promise<SubscriptionWithItems | null>;
    /** Returns the matched id when `feedUrl` collides, ignoring `ignoreId`. */
    findDuplicateFeed(feedUrl: string, ignoreId?: string): Promise<string | null>;
    add(input: SubscriptionCreateInput): Promise<SubscriptionWithItems>;
    update(id: string, patch: SubscriptionUpdateInput & Partial<SubscriptionRule>): Promise<SubscriptionWithItems | null>;
    remove(id: string): Promise<boolean>;
    /** Replace the entire `subscription_items` snapshot for one subscription. */
    replaceItems(subscriptionId: string, items: NormalizedFeedItem[]): Promise<void>;
    /**
     * Upsert items without dropping rows that are missing from `items`. Profile
     * subscriptions use this: a failed category or an expired story must stay
     * in the seen-history so the next check does not queue it again.
     */
    mergeItems(subscriptionId: string, items: NormalizedFeedItem[]): Promise<void>;
    /**
     * Mark an item as `added` and link the spawned task id. Idempotent — if
     * the row already records the same taskId nothing changes.
     */
    markItemQueued(subscriptionId: string, itemId: string, taskId: string | null): Promise<void>;
    /**
     * Clear the queue flag and task id for the selected rows. The item rows
     * stay so the feed still treats them as already seen.
     */
    clearQueueLinks(selector: QueueLinkSelector): Promise<number>;
    /**
     * Clear queue links whose task id is missing or rejected by `isLive`.
     * Returns how many rows changed.
     */
    clearOrphanedQueueLinks(isLive: (taskId: string) => boolean | Promise<boolean>): Promise<number>;
}
export interface QueueLinkSelector {
    taskIds?: readonly string[];
    items?: readonly {
        subscriptionId: string;
        itemId: string;
    }[];
}
export interface CreateSqliteStoresOptions {
    db: BetterSQLite3Database;
    /** Defaults to `Date.now`. */
    now?: () => number;
    /** Defaults to `crypto.randomUUID`. */
    generateId?: () => string;
}
export declare const createSqliteSubscriptionsStore: ({ db, now, generateId }: CreateSqliteStoresOptions) => SubscriptionsStore;
export declare const createSqliteMetaStore: ({ db, now }: CreateSqliteStoresOptions) => MetaStore;
/**
 * In-memory MetaStore for CLI's `--vidbee-local` mode (where
 * leader election is a no-op since no other process can compete).
 */
export declare class InMemoryMetaStore implements MetaStore {
    private state;
    readLeader(): Promise<LeaderState>;
    casLeader({ expectedLeaseId, now, next }: {
        expectedLeaseId: string | null;
        now: number;
        next: Pick<LeaderState, 'kind' | 'pid' | 'startedAt' | 'heartbeatAt' | 'lockExpiresAt' | 'leaseId'>;
    }): Promise<boolean>;
    readPreferred(): Promise<LeaderKind | null>;
    writePreferred(kind: LeaderKind | null): Promise<void>;
}
