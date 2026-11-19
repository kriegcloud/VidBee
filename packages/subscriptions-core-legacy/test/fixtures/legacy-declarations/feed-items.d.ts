// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
/**
 * Helpers for working with parsed RSS items: normalization, dedupe, and
 * thumbnail/cover extraction. All functions are pure — feeding the same
 * `ParsedFeedItem[]` always returns the same `NormalizedFeedItem[]`.
 */
import type { NormalizedFeedItem, ParsedFeed, ParsedFeedItem, SubscriptionFeedItem } from './types';
interface SubscriptionFeedSource {
    id: string;
    items?: SubscriptionFeedItem[];
}
export interface SubscriptionFeedEntry<TSubscription extends SubscriptionFeedSource> {
    subscription: TSubscription;
    item: NonNullable<TSubscription['items']>[number];
}
/** Merge subscription items into one newest-first timeline while retaining their source. */
export declare const getSubscriptionFeedEntries: <TSubscription extends SubscriptionFeedSource>(subscriptions: TSubscription[]) => SubscriptionFeedEntry<TSubscription>[];
/**
 * Pick the best thumbnail for one feed item: iTunes episode artwork first,
 * then media/enclosure images, then an `<img>` extracted from HTML content.
 *
 * @param item Parsed rss-parser item
 */
export declare const resolveThumbnail: (item: ParsedFeedItem) => string | undefined;
/**
 * Pick the best cover URL for a feed: explicit feed image first, then
 * iTunes-style image, then the first thumbnail we can extract from any item.
 */
export declare const resolveFeedCover: (feed: Pick<ParsedFeed, 'image' | 'itunes'>, items: NormalizedFeedItem[], rawItems: ParsedFeedItem[]) => string | undefined;
export interface NormalizeOptions {
    now?: () => number;
}
/**
 * Convert a list of parsed RSS items into the canonical normalized shape.
 * Items missing id / link / title are dropped silently. Output is sorted by
 * publishedAt descending so callers can take the head as "latest".
 */
export declare const normalizeFeedItems: (items: ParsedFeedItem[], options?: NormalizeOptions) => NormalizedFeedItem[];
/**
 * Drop items whose stable id has already been seen earlier in the list,
 * preserving order. Used after `normalizeFeedItems` for upserts and again
 * before queue insertion to guarantee one-task-per-(subscription, itemId).
 */
export declare const dedupeFeedItems: <T extends {
    id: string;
}>(items: T[]) => T[];
export {};
