// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import type { AutoDownloadDecision, ParsedFeed, SubscriptionFeedItem, SubscriptionRule } from './types';
export interface AutoDownloadInputs {
    subscription: SubscriptionRule;
    /** Items currently persisted on the subscription (most-recent-first ok). */
    knownItems: SubscriptionFeedItem[];
    /** Parsed RSS feed (rss-parser output, normalized to ParsedFeed shape). */
    feed: ParsedFeed;
    /**
     * Optional: returns true if a candidate URL is already in the global
     * download history (so we shouldn't re-queue it). Hosts can wire this to
     * their own history table; defaults to "always false".
     */
    isHistoryDup?: (url: string) => boolean;
    now?: () => number;
}
/**
 * Pure function — no side effects. Hosts feed the returned items into the
 * task queue. The caller owns persistence; this function only computes.
 */
export declare const decideAutoDownloads: ({ subscription, knownItems, feed, isHistoryDup, now }: AutoDownloadInputs) => AutoDownloadDecision;
