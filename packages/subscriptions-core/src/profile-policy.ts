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
import { dedupeFeedItems } from './feed-items'
import {
  DEFAULT_FEED_CHECK_INTERVAL_MS,
  type NormalizedFeedItem,
  type ProfileCategoryError,
  type ProfileCheckResult,
  profileItemCategory,
  profileItemId,
  type SubscriptionFeedItem,
  type SubscriptionRule,
  type SubscriptionStatus
} from './types'

/** Spread of the next profile check, so accounts added together drift apart. */
const PROFILE_CHECK_JITTER = 0.1

export const resolveCheckIntervalMs = (subscription: SubscriptionRule): number =>
  subscription.checkIntervalMs ?? DEFAULT_FEED_CHECK_INTERVAL_MS

/**
 * True when an enabled subscription should be checked on this scheduler tick.
 * `nextCheckAt` (set after profile checks and rate limits) wins over the
 * `lastCheckedAt + interval` fallback that RSS feeds use.
 */
export const isSubscriptionDue = (subscription: SubscriptionRule, now: number): boolean => {
  if (!subscription.enabled) {
    return false
  }
  if (subscription.nextCheckAt !== undefined) {
    return now >= subscription.nextCheckAt
  }
  if (subscription.lastCheckedAt === undefined) {
    return true
  }
  return now - subscription.lastCheckedAt >= resolveCheckIntervalMs(subscription)
}

/**
 * Next check time after a profile check: the platform's retry hint when it
 * rate-limited us, otherwise the interval with ±10% jitter.
 *
 * @param random Injected for tests; returns a value in [0, 1).
 */
export const nextProfileCheckAt = (
  subscription: SubscriptionRule,
  now: number,
  retryAfter?: number,
  random: () => number = Math.random
): number => {
  if (retryAfter !== undefined && retryAfter > now) {
    return retryAfter
  }
  const interval = resolveCheckIntervalMs(subscription)
  const jitter = (random() * 2 - 1) * PROFILE_CHECK_JITTER * interval
  return Math.round(now + interval + jitter)
}

const ERROR_SEVERITY: Record<ProfileCategoryError, number> = {
  'rate-limited': 3,
  'auth-required': 2,
  error: 1
}

/**
 * Collapse per-category outcomes into the subscription status. A rate limit
 * outranks a missing sign-in, which outranks a generic failure; any failed
 * category is surfaced even when the others mapped.
 */
export const summarizeProfileStatus = (
  subscription: SubscriptionRule,
  result: ProfileCheckResult
): SubscriptionStatus => {
  let worst: ProfileCategoryError | undefined
  for (const category of subscription.categories) {
    const error = result.categoryErrors[category]
    if (error && (!worst || ERROR_SEVERITY[error] > ERROR_SEVERITY[worst])) {
      worst = error
    }
  }
  if (worst === 'rate-limited' || worst === 'auth-required') {
    return worst
  }
  return worst === 'error' ? 'failed' : 'up-to-date'
}

export interface ProfileDownloadInputs {
  subscription: SubscriptionRule
  knownItems: SubscriptionFeedItem[]
  result: ProfileCheckResult
  isHistoryDup?: (url: string) => boolean
  now?: () => number
}

export interface ProfileDownloadDecision {
  /** Items to queue now (empty when auto-download is off). */
  items: NormalizedFeedItem[]
  /** Every mapped item of a followed category; merged into the item history. */
  itemsToPersist: NormalizedFeedItem[]
  latest?: NormalizedFeedItem
}

const defaultTitle = (subscription: SubscriptionRule, category: string, id: string): string =>
  `@${subscription.profileOwner ?? subscription.title} · ${category} · ${id}`

/**
 * Decide which mapped items are new. Item ids are `<category>:<id>`, so the
 * same post in two followed categories (an X post in Posts and Media, an
 * Instagram post that is also tagged) is remembered under both but queued
 * once, by URL.
 */
export const decideProfileDownloads = ({
  subscription,
  knownItems,
  result,
  isHistoryDup,
  now = () => Date.now()
}: ProfileDownloadInputs): ProfileDownloadDecision => {
  const followed = new Set(subscription.categories)
  const discoveredAt = now()
  const knownById = new Map(knownItems.map((item) => [item.id, item]))
  // Categories each known URL was seen under, to spot cross-category repeats.
  const knownUrlCategories = new Map<string, Set<string | undefined>>()
  for (const item of knownItems) {
    const categories = knownUrlCategories.get(item.url) ?? new Set()
    categories.add(profileItemCategory(subscription.platform, item.id))
    knownUrlCategories.set(item.url, categories)
  }
  const versioned = new Set<string>()

  const normalized = dedupeFeedItems(
    result.items
      .filter((item) => followed.has(item.category) && item.id && item.url)
      .map((item): NormalizedFeedItem => {
        const id = profileItemId(item.category, item.id)
        if (item.versioned) {
          versioned.add(id)
        }
        const entry: NormalizedFeedItem = {
          id,
          url: item.url,
          title: item.title?.trim() || defaultTitle(subscription, item.category, item.id),
          // Undated items keep the time they were first seen instead of
          // jumping to the top on every check.
          publishedAt: item.publishedAt ?? knownById.get(id)?.publishedAt ?? discoveredAt
        }
        if (item.thumbnail) {
          entry.thumbnail = item.thumbnail
        }
        return entry
      })
  ).sort((a, b) => b.publishedAt - a.publishedAt)

  const queuedUrls = new Set<string>()
  const queue: NormalizedFeedItem[] = []
  for (const item of normalized) {
    if (knownById.has(item.id) || queuedUrls.has(item.url)) {
      continue
    }
    // A new version of a known collection (same URL, same category) is new content.
    const isNewVersion = versioned.has(item.id)
    const seenUnder = knownUrlCategories.get(item.url)
    const category = profileItemCategory(subscription.platform, item.id)
    if (seenUnder && !(isNewVersion && [...seenUnder].every((entry) => entry === category))) {
      continue
    }
    if (!isNewVersion && isHistoryDup?.(item.url)) {
      continue
    }
    queuedUrls.add(item.url)
    queue.push(item)
  }

  const decision: ProfileDownloadDecision = {
    items: subscription.autoDownload ? queue : [],
    itemsToPersist: normalized
  }
  if (normalized[0]) {
    decision.latest = normalized[0]
  }
  return decision
}
