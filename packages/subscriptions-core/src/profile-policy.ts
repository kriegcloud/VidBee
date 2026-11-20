import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";
/**
 * Scheduling and auto-download policy for profile subscriptions (Instagram,
 * Threads, X, TikTok, Snapchat). Pure functions; `SubscriptionsApi` owns the
 * side effects.
 *
 * Unlike RSS, mapped profile items often carry no date, so "new" means "not
 * seen before" rather than "published after the last check". The first check
 * queues the whole backlog of the followed categories; history dedupe keeps
 * already-downloaded posts out.
 */
import { dedupeFeedItems } from "./feed-items.js";
import { DEFAULT_FEED_CHECK_INTERVAL_MS, profileItemCategory, profileItemId } from "./types.js";
import type {
  NormalizedFeedItem,
  ProfileCategoryError,
  ProfileCheckResult,
  SubscriptionFeedItem,
  SubscriptionRule,
  SubscriptionStatus,
} from "./types.js";

/** Spread of the next profile check, so accounts added together drift apart. */
const PROFILE_CHECK_JITTER = 0.1;

export const resolveCheckIntervalMs = (subscription: SubscriptionRule): number =>
  subscription.checkIntervalMs ?? DEFAULT_FEED_CHECK_INTERVAL_MS;

/**
 * True when an enabled subscription should be checked on this scheduler tick.
 * `nextCheckAt` (set after profile checks and rate limits) wins over the
 * `lastCheckedAt + interval` fallback that RSS feeds use.
 */
const subscriptionDue = (subscription: SubscriptionRule, now: number): boolean => {
  if (!subscription.enabled) {
    return false;
  }
  if (subscription.nextCheckAt !== undefined) {
    return now >= subscription.nextCheckAt;
  }
  if (subscription.lastCheckedAt === undefined) {
    return true;
  }
  return now - subscription.lastCheckedAt >= resolveCheckIntervalMs(subscription);
};

/**
 * Next check time after a profile check: the platform's retry hint when it
 * rate-limited us, otherwise the interval with ±10% jitter.
 *
 * @param random Injected for tests; returns a value in [0, 1).
 */
const profileCheckAt = (
  subscription: SubscriptionRule,
  now: number,
  retryAfter: number | undefined,
  random: () => number
): number => {
  if (retryAfter !== undefined && retryAfter > now) {
    return retryAfter;
  }
  const interval = resolveCheckIntervalMs(subscription);
  const jitter = (random() * 2 - 1) * PROFILE_CHECK_JITTER * interval;
  return Math.round(now + interval + jitter);
};

const ERROR_SEVERITY: Record<ProfileCategoryError, number> = {
  "rate-limited": 3,
  "auth-required": 2,
  error: 1,
};

/**
 * Collapse per-category outcomes into the subscription status. A rate limit
 * outranks a missing sign-in, which outranks a generic failure; any failed
 * category is surfaced even when the others mapped.
 */
const profileStatus = (subscription: SubscriptionRule, result: ProfileCheckResult): SubscriptionStatus => {
  let worst: ProfileCategoryError | undefined;
  for (const category of subscription.categories) {
    const error = result.categoryErrors[category];
    if (
      error !== undefined &&
      Boolean(error) &&
      (worst === undefined || !Boolean(worst) || ERROR_SEVERITY[error] > ERROR_SEVERITY[worst])
    ) {
      worst = error;
    }
  }
  if (worst === "rate-limited" || worst === "auth-required") {
    return worst;
  }
  return worst === "error" ? "failed" : "up-to-date";
};

export interface ProfileDownloadInputs {
  isHistoryDup?: ((url: string) => boolean) | undefined;
  knownItems: SubscriptionFeedItem[];
  result: ProfileCheckResult;
  subscription: SubscriptionRule;
}

export interface ProfileDownloadDecision {
  /** Items to queue now (empty when auto-download is off). */
  items: NormalizedFeedItem[];
  /** Every mapped item of a followed category; merged into the item history. */
  itemsToPersist: NormalizedFeedItem[];
  latest?: NormalizedFeedItem;
}

const defaultTitle = (subscription: SubscriptionRule, category: string, id: string): string =>
  `@${subscription.profileOwner ?? subscription.title} · ${category} · ${id}`;

/**
 * Decide which mapped items are new. Item ids are `<category>:<id>`, so the
 * same post in two followed categories (an X post in Posts and Media, an
 * Instagram post that is also tagged) is remembered under both but queued
 * once, by URL.
 */
const profileDownloads = (
  { subscription, knownItems, result, isHistoryDup }: ProfileDownloadInputs,
  now: () => number
): ProfileDownloadDecision => {
  const followed =
    subscription.categories === undefined || subscription.categories === null
      ? MutableHashSet.empty<string>()
      : MutableHashSet.fromIterable(subscription.categories);
  const discoveredAt = now();
  const knownById = MutableHashMap.fromIterable(A.map(knownItems, (item) => [item.id, item] as const));
  // Categories each known URL was seen under, to spot cross-category repeats.
  const knownUrlCategories = MutableHashMap.empty<string, MutableHashSet.MutableHashSet<string | undefined>>();
  for (const item of knownItems) {
    const categories = O.getOrElse(MutableHashMap.get(knownUrlCategories, item.url), () =>
      MutableHashSet.empty<string | undefined>()
    );
    MutableHashSet.add(categories, profileItemCategory(subscription.platform, item.id));
    MutableHashMap.set(knownUrlCategories, item.url, categories);
  }
  const versioned = MutableHashSet.empty<string>();

  const normalized = dedupeFeedItems(
    A.map(
      A.filter(
        result.items,
        (item) => MutableHashSet.has(followed, item.category) && Boolean(item.id) && Boolean(item.url)
      ),
      (item): NormalizedFeedItem => {
        const id = profileItemId(item.category, item.id);
        if (Boolean(item.versioned)) {
          MutableHashSet.add(versioned, id);
        }
        const trimmedTitle = item.title === null || item.title === undefined ? undefined : Str.trim(item.title);
        const entry: NormalizedFeedItem = {
          id,
          url: item.url,
          title:
            trimmedTitle === undefined || !Boolean(trimmedTitle)
              ? defaultTitle(subscription, item.category, item.id)
              : trimmedTitle,
          // Undated items keep the time they were first seen instead of
          // jumping to the top on every check.
          publishedAt:
            item.publishedAt ?? O.getOrUndefined(MutableHashMap.get(knownById, id))?.publishedAt ?? discoveredAt,
        };
        if (Boolean(item.thumbnail)) {
          entry.thumbnail = item.thumbnail;
        }
        return entry;
      }
    )
  );
  const sorted = A.sort(normalized, (a: NormalizedFeedItem, b: NormalizedFeedItem) => {
    const difference = b.publishedAt - a.publishedAt;
    return difference < 0 ? -1 : difference > 0 ? 1 : 0;
  });

  const queuedUrls = MutableHashSet.empty<string>();
  const queue: NormalizedFeedItem[] = [];
  for (const item of sorted) {
    if (MutableHashMap.has(knownById, item.id) || MutableHashSet.has(queuedUrls, item.url)) {
      continue;
    }
    // A new version of a known collection (same URL, same category) is new content.
    const isNewVersion = MutableHashSet.has(versioned, item.id);
    const seenUnder = O.getOrUndefined(MutableHashMap.get(knownUrlCategories, item.url));
    const category = profileItemCategory(subscription.platform, item.id);
    if (seenUnder !== undefined && !(isNewVersion && A.every(Array.from(seenUnder), (entry) => entry === category))) {
      continue;
    }
    if (!isNewVersion && Boolean(isHistoryDup?.(item.url))) {
      continue;
    }
    MutableHashSet.add(queuedUrls, item.url);
    queue.push(item);
  }

  const decision: ProfileDownloadDecision = {
    items: subscription.autoDownload ? queue : [],
    itemsToPersist: sorted,
  };
  if (sorted[0] !== undefined) {
    decision.latest = sorted[0];
  }
  return decision;
};

export const isSubscriptionDue: {
  (subscription: SubscriptionRule, now: number): boolean;
  (now: number): (subscription: SubscriptionRule) => boolean;
} = dual(2, subscriptionDue);
export const nextProfileCheckAt: {
  (subscription: SubscriptionRule, now: number, retryAfter: number | undefined, random: () => number): number;
  (now: number, retryAfter: number | undefined, random: () => number): (subscription: SubscriptionRule) => number;
} = dual(4, profileCheckAt);
export const summarizeProfileStatus: {
  (subscription: SubscriptionRule, result: ProfileCheckResult): SubscriptionStatus;
  (result: ProfileCheckResult): (subscription: SubscriptionRule) => SubscriptionStatus;
} = dual(2, profileStatus);
export const decideProfileDownloads: {
  (input: ProfileDownloadInputs, now: () => number): ProfileDownloadDecision;
  (now: () => number): (input: ProfileDownloadInputs) => ProfileDownloadDecision;
} = dual(2, profileDownloads);
