import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Str from "effect/String";
/**
 * Auto-download policy: given a freshly parsed feed and the current
 * subscription state, decide which items should be queued in the shared
 * task-queue and what cover/title metadata to refresh on the subscription.
 *
 * The policy is host-neutral. Hosts call this and then feed each returned
 * item through `taskQueueAPI.add({ kind: 'subscription-item', priority: 10,
 * groupKey: subscription.id, ... })`.
 */
import { dedupeFeedItems, normalizeFeedItems, resolveFeedCover } from "./feed-items.js";
import type { NormalizeOptions } from "./feed-items.js";
import type {
  AutoDownloadDecision,
  NormalizedFeedItem,
  ParsedFeed,
  SubscriptionFeedItem,
  SubscriptionRule,
} from "./types.js";

export interface AutoDownloadInputs {
  /** Parsed RSS feed (rss-parser output, normalized to ParsedFeed shape). */
  feed: ParsedFeed;
  /**
   * Optional: returns true if a candidate URL is already in the global
   * download history (so we shouldn't re-queue it). Hosts can wire this to
   * their own history table; defaults to "always false".
   */
  isHistoryDup?: ((url: string) => boolean) | undefined;
  /** Items currently persisted on the subscription (most-recent-first ok). */
  knownItems: SubscriptionFeedItem[];
  subscription: SubscriptionRule;
}

const lastKnownPublishedAt = (subscription: SubscriptionRule, knownItems: SubscriptionFeedItem[]): number => {
  const fromItems = A.reduce(knownItems, 0, (max, item) => Math.max(max, item.publishedAt));
  return Math.max(subscription.latestVideoPublishedAt ?? 0, fromItems);
};

const filterRecent = (
  subscription: SubscriptionRule,
  items: NormalizedFeedItem[],
  knownItems: SubscriptionFeedItem[]
): NormalizedFeedItem[] => {
  const cutoff = lastKnownPublishedAt(subscription, knownItems);
  if (cutoff === 0) {
    return subscription.onlyDownloadLatest ? A.take(items, 1) : items;
  }
  return A.filter(items, (item) => item.publishedAt > cutoff);
};

const filterUnseen = (knownItems: SubscriptionFeedItem[], items: NormalizedFeedItem[]): NormalizedFeedItem[] => {
  const seen = MutableHashSet.fromIterable(A.map(knownItems, (item) => item.id));
  return A.filter(items, (item) => !MutableHashSet.has(seen, item.id));
};

const matchesKeywords = (item: NormalizedFeedItem, keywords: string[]): boolean => {
  if (keywords.length === 0) {
    return true;
  }
  const lowered = Str.toLowerCase(item.title);
  return A.some(keywords, (keyword) => Str.includes(Str.toLowerCase(keyword))(lowered));
};

/**
 * Pure function — no side effects. Hosts feed the returned items into the
 * task queue. The caller owns persistence; this function only computes.
 */
const autoDownloads = (
  { subscription, knownItems, feed, isHistoryDup }: AutoDownloadInputs,
  options: NormalizeOptions
): AutoDownloadDecision => {
  const rawItems = A.isArray(feed.items) ? feed.items : [];
  const normalized = normalizeFeedItems(rawItems, options);

  const recent = filterRecent(subscription, normalized, knownItems);
  const unseen = filterUnseen(knownItems, recent);
  const keywordFiltered = A.filter(unseen, (item) => matchesKeywords(item, subscription.keywords));
  const deduped = A.sort(
    A.filter(dedupeFeedItems(keywordFiltered), (item) => !(isHistoryDup?.(item.url) ?? false)),
    (a: NormalizedFeedItem, b: NormalizedFeedItem) => {
      const difference = b.publishedAt - a.publishedAt;
      return difference < 0 ? -1 : difference > 0 ? 1 : 0;
    }
  );

  const queued = subscription.onlyDownloadLatest && deduped[0] !== undefined ? [deduped[0]] : deduped;
  const items = subscription.autoDownload ? queued : [];

  const latest = normalized[0];
  const coverUrl = resolveFeedCover(feed, normalized, rawItems);

  const decision: AutoDownloadDecision = {
    subscription,
    items,
    feedItemsToPersist: normalized,
    latestPublishedAt: latest?.publishedAt ?? null,
  };
  if (latest !== undefined && Boolean(latest.title)) {
    decision.latestVideoTitle = latest.title;
  }
  if (Boolean(coverUrl)) {
    decision.coverUrl = coverUrl;
  }
  return decision;
};

export const decideAutoDownloads: {
  (input: AutoDownloadInputs, options: NormalizeOptions): AutoDownloadDecision;
  (options: NormalizeOptions): (input: AutoDownloadInputs) => AutoDownloadDecision;
} = dual(2, autoDownloads);
