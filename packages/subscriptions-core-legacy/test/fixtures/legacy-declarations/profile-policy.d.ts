// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import { type NormalizedFeedItem, type ProfileCheckResult, type SubscriptionFeedItem, type SubscriptionRule, type SubscriptionStatus } from './types';
export declare const resolveCheckIntervalMs: (subscription: SubscriptionRule) => number;
/**
 * True when an enabled subscription should be checked on this scheduler tick.
 * `nextCheckAt` (set after profile checks and rate limits) wins over the
 * `lastCheckedAt + interval` fallback that RSS feeds use.
 */
export declare const isSubscriptionDue: (subscription: SubscriptionRule, now: number) => boolean;
/**
 * Next check time after a profile check: the platform's retry hint when it
 * rate-limited us, otherwise the interval with ±10% jitter.
 *
 * @param random Injected for tests; returns a value in [0, 1).
 */
export declare const nextProfileCheckAt: (subscription: SubscriptionRule, now: number, retryAfter?: number, random?: () => number) => number;
/**
 * Collapse per-category outcomes into the subscription status. A rate limit
 * outranks a missing sign-in, which outranks a generic failure; any failed
 * category is surfaced even when the others mapped.
 */
export declare const summarizeProfileStatus: (subscription: SubscriptionRule, result: ProfileCheckResult) => SubscriptionStatus;
export interface ProfileDownloadInputs {
    subscription: SubscriptionRule;
    knownItems: SubscriptionFeedItem[];
    result: ProfileCheckResult;
    isHistoryDup?: (url: string) => boolean;
    now?: () => number;
}
export interface ProfileDownloadDecision {
    /** Items to queue now (empty when auto-download is off). */
    items: NormalizedFeedItem[];
    /** Every mapped item of a followed category; merged into the item history. */
    itemsToPersist: NormalizedFeedItem[];
    latest?: NormalizedFeedItem;
}
/**
 * Decide which mapped items are new. Item ids are `<category>:<id>`, so the
 * same post in two followed categories (an X post in Posts and Media, an
 * Instagram post that is also tagged) is remembered under both but queued
 * once, by URL.
 */
export declare const decideProfileDownloads: ({ subscription, knownItems, result, isHistoryDup, now }: ProfileDownloadInputs) => ProfileDownloadDecision;
