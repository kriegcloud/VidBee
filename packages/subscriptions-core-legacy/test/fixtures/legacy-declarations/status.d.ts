// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
export interface SubscriptionStatusMeta {
    dotClass: string;
    textClass: string;
    label: string;
}
export declare const disabledStatusMeta: SubscriptionStatusMeta;
/**
 * Resolve the subscription status styles without crashing on stale or unknown values.
 *
 * @param status The persisted subscription status.
 * @param enabled Whether the subscription is enabled.
 * @returns The status style metadata used by the subscriptions UI.
 */
export declare const getSubscriptionStatusMeta: (status: string | undefined, enabled: boolean) => SubscriptionStatusMeta;
export type SubscriptionItemQueueStatus = 'notQueued' | 'queued' | 'pending' | 'downloading' | 'processing' | 'completed' | 'error' | 'cancelled';
/**
 * Map a feed item to the live download status when it has been queued.
 *
 * @param item Feed item with optional task/download id.
 * @param downloadById Live and history downloads keyed by id.
 * @returns Queue or download status used by the subscriptions grid.
 */
export declare const resolveSubscriptionItemStatus: (item: {
    addedToQueue: boolean;
    downloadId?: string;
    taskId?: string;
}, downloadById: ReadonlyMap<string, {
    status: string;
}>) => SubscriptionItemQueueStatus;
