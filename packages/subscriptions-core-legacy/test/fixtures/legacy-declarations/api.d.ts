// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import type { TaskCreationMetadata } from '@vidbee/task-queue-legacy';
import type { FeedFetcher } from './feed-parser';
import { type LeaderElectionOptions, type MetaStore } from './leader';
import { type FeedCheckSchedulerOptions } from './scheduler';
import type { SubscriptionsStore } from './store';
import { type LeaderKind, type LeaderState, type NormalizedFeedItem, type ProfileSourceFetcher, type ResolvedFeed, SUBSCRIPTION_DUPLICATE_FEED_ERROR, type SubscriptionCreateInput, type SubscriptionFeedItem, type SubscriptionRule, type SubscriptionUpdateInput, type SubscriptionWithItems } from './types';
export interface EnqueueItemContext {
    creation?: TaskCreationMetadata;
    subscription: SubscriptionRule;
    item: NormalizedFeedItem;
    /** Why we're enqueuing — 'auto' for scheduled feed-check, 'manual' for user. */
    trigger: 'auto' | 'manual';
    /** Items queued by one profile check share a queue batch. */
    batch?: {
        id: string;
        title: string;
    };
}
/**
 * Host-provided callback that pushes the item into the shared task-queue.
 * Returns the spawned task id; null if the host decided to skip (e.g.
 * historic dedupe). Errors propagate.
 */
export type EnqueueItem = (ctx: EnqueueItemContext) => Promise<string | null>;
export interface SubscriptionsApiOptions {
    kind: LeaderKind;
    pid: number;
    store: SubscriptionsStore;
    metaStore: MetaStore;
    fetcher: FeedFetcher;
    /**
     * Checks profile subscriptions through the host's profile mappers. Hosts
     * without one (the API server) list profile subscriptions but never check
     * them; Desktop owns those checks regardless of the RSS leader lease.
     */
    profileFetcher?: ProfileSourceFetcher;
    enqueueItem: EnqueueItem;
    /** Optional: returns true if a URL is already in download history. */
    isHistoryDup?: (url: string) => boolean;
    /**
     * Returns true when `taskId` still exists in the shared task database,
     * including history. Hosts must answer from that database: Desktop and the
     * API share `vidbee.db`, and a task the other host created after startup is
     * missing from this process's queue memory. Used to drop queue links for
     * removed tasks. When omitted, a stored queue flag keeps blocking manual
     * enqueue.
     */
    taskExists?: (taskId: string) => boolean | Promise<boolean>;
    /**
     * Lifted out of `LeaderElectionOptions` for ergonomics; the rest of the
     * leader knobs (heartbeat ms, lock TTL ms, etc.) accept a single options
     * bag. Defaults match the NEX-132 spec.
     */
    leader?: Omit<LeaderElectionOptions, 'metaStore' | 'kind' | 'pid' | 'onStateChange'>;
    scheduler?: Omit<FeedCheckSchedulerOptions, 'runAll' | 'runOne' | 'isLeader'>;
    log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void;
    now?: () => number;
}
export { SUBSCRIPTION_DUPLICATE_FEED_ERROR };
/** Profile subscriptions are checked by VidBee Desktop; other hosts cannot create them. */
export declare const SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR = "SUBSCRIPTION_PROFILE_DESKTOP_ONLY";
export type SubscriptionsApiEvent = 'changed';
export type SubscriptionsApiListener = (kind: SubscriptionsApiEvent) => void;
export declare class SubscriptionsApi {
    private readonly store;
    private readonly fetcher;
    private readonly profileFetcher;
    private readonly enqueueItem;
    private readonly isHistoryDup;
    private readonly taskExists;
    private readonly log;
    private readonly now;
    private readonly election;
    private readonly scheduler;
    private readonly listeners;
    private readonly pendingRemovedTaskIds;
    private removedTaskFlush;
    /** One check per subscription at a time; a second caller awaits the first. */
    private readonly inFlight;
    private readonly checkControllers;
    constructor(opts: SubscriptionsApiOptions);
    /**
     * Register a listener that fires after every state mutation (add / update /
     * remove / refresh / itemsQueue). Hosts use this to push a fresh snapshot
     * to their UI (Desktop's renderer IPC, API's SSE if/when subscription SSE
     * is wired up). Returns an unsubscribe function.
     */
    on(_event: SubscriptionsApiEvent, listener: SubscriptionsApiListener): () => void;
    private emitChanged;
    /**
     * Acquire (or steal) the leader lease and start the periodic loop. Calling
     * this on every host is safe; only the winner runs `runAll` on tick.
     */
    start(): Promise<void>;
    stop(): Promise<void>;
    isLeader(): boolean;
    observeLeader(): Promise<LeaderState>;
    list(): Promise<{
        items: SubscriptionWithItems[];
        total: number;
    }>;
    get(input: {
        id: string;
    }): Promise<SubscriptionWithItems>;
    resolve(input: {
        rawUrl: string;
    }): ResolvedFeed;
    add(input: SubscriptionCreateInput): Promise<SubscriptionWithItems>;
    update(input: {
        id: string;
    } & SubscriptionUpdateInput): Promise<SubscriptionWithItems>;
    remove(input: {
        id: string;
    }): Promise<Record<string, never>>;
    refresh(input: {
        id: string;
    }): Promise<SubscriptionWithItems>;
    itemsList(input: {
        subscriptionId: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: SubscriptionFeedItem[];
        total: number;
    }>;
    /** Queue a selected entry once, retaining trusted creator metadata when supplied by the host. */
    itemsQueue(input: {
        subscriptionId: string;
        itemId: string;
    }, creation?: TaskCreationMetadata): Promise<{
        queued: boolean;
        taskId: string | null;
    }>;
    /**
     * Clear queue links for tasks the host has removed. Item rows stay so the
     * next feed check still treats them as already seen. Emits `changed` when
     * at least one row was updated.
     */
    releaseRemovedTasks(taskIds: readonly string[]): Promise<number>;
    /**
     * Coalesce task-removal notifications from a synchronous bulk delete into
     * one queue-link update and one subscriber notification.
     */
    noteTaskRemoved(taskId: string): void;
    /**
     * A missing callback keeps the stored link. Otherwise the answer comes from
     * the host, which must consult the shared task database.
     */
    private linkedTaskStillExists;
    /**
     * Drop queue links that point at tasks the host no longer has. Safe to call
     * on startup; a missing `taskExists` callback leaves stored links alone.
     */
    reconcileOrphanedTasks(): Promise<number>;
    /**
     * Check every enabled subscription that is due, or all of them when
     * forced. Errors in one subscription don't prevent others from being checked.
     */
    refreshAll(options?: {
        force?: boolean;
    }): Promise<void>;
    /**
     * Run a feed-check pass over a single subscription. Used both by the
     * scheduler tick (for each enabled sub) and by manual `refresh(id)` calls.
     */
    refreshOne(subscriptionId: string): Promise<void>;
    /** Feeds follow the RSS leader lease; profile checks need a profile fetcher. */
    private canCheck;
    private checkSubscription;
    /**
     * Check one profile subscription through the host's mappers. Categories
     * that fail keep their previous items; the rest are merged and new items
     * are queued. Hosts without a profile fetcher leave the row untouched.
     */
    private checkProfile;
}
