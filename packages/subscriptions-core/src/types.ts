import { dual } from "effect/Function";
import * as O from "effect/Option";
import * as R from "effect/Record";
import * as Str from "effect/String";
import type { ProfilePlatform, SubscriptionPlatform } from "./Subscription.model.js";

/**
 * Canonical domain model for @vidbee/subscriptions-core.
 *
 * Authoritative spec: NEX-132 issue body (`Phase A · packages/subscriptions-core`)
 * and `docs/vidbee-desktop-first-cli-ytdlp-rss-design.md` §7.
 *
 * Adapters in apps/desktop, apps/api and apps/cli MUST consume these types
 * directly; any host-local divergence is a contract bug.
 */

/** Accounts checked through VidBee's profile mappers instead of an RSS feed. */
export type {
  FeedPlatform,
  ProfilePlatform,
  SubscriptionPlatform,
  SubscriptionSourceKind,
} from "./Subscription.model.js";

/**
 * Categories a profile subscription can follow, per platform. The resolver,
 * the form dialog, the desktop fetcher and input validation all read this one
 * catalog. Snapchat `stories` covers the current story and saved highlights;
 * X `posts-with-media` is the Posts tab kept to entries that carry media.
 */
export const PROFILE_SUBSCRIPTION_CATEGORIES = {
  instagram: ["stories", "highlights", "posts", "reels", "tagged"],
  tiktok: ["stories", "posts"],
  snapchat: ["stories", "spotlight"],
  threads: ["media"],
  x: ["posts-with-media", "media"],
} as const satisfies Record<ProfilePlatform, readonly string[]>;

export type ProfileSubscriptionCategory<P extends ProfilePlatform = ProfilePlatform> =
  (typeof PROFILE_SUBSCRIPTION_CATEGORIES)[P][number];

export const PROFILE_PLATFORMS = R.keys(PROFILE_SUBSCRIPTION_CATEGORIES) as readonly ProfilePlatform[];

export const isProfilePlatform = (value: string | null | undefined): value is ProfilePlatform =>
  (PROFILE_PLATFORMS as readonly string[]).includes(value ?? "");

/** Synthetic feed URL for profile sources; keeps duplicate detection by feed URL. */
export const PROFILE_FEED_URL_PROTOCOL = "vidbee-profile:";

/** Per-subscription overrides; omitted values follow the host's download defaults. */
/**
 * High-level subscription state. The granular task lifecycle for a
 * subscription item is owned by `@vidbee/task-queue-legacy` (see `TaskStatus`); this
 * field describes only the result of the most recent feed-check, not
 * individual items.
 */
/** Returned by `feed-resolver` from a raw user-entered URL. */
/** Raw RSS-parser item shape we read into. Hosts may pass extras. */
/** One mapped profile entry, already scoped to a followed category. */
export type {
  NormalizedFeedItem,
  ParsedFeed,
  ParsedFeedItem,
  ProfileCategoryError,
  ProfileCheckResult,
  ProfileFeedItem,
  ResolvedFeed,
  SubscriptionCreateInput,
  SubscriptionDownloadPreferences,
  SubscriptionFeedItem,
  SubscriptionRule,
  SubscriptionStatus,
  SubscriptionUpdateInput,
  SubscriptionWithItems,
} from "./Subscription.model.js";

/** Host seam that checks a profile subscription through VidBee's mappers. */

export const profileItemId: {
  (category: string, id: string): string;
  (id: string): (category: string) => string;
} = dual(2, (category: string, id: string): string => `${category}:${id}`);

/** Category of a profile item id, or undefined for feed items and unknown prefixes. */
const itemCategory = (platform: SubscriptionPlatform, itemId: string): string | undefined => {
  if (!isProfilePlatform(platform)) {
    return;
  }
  const category = Str.slice(
    0,
    Math.max(
      O.getOrElse(Str.indexOf(":")(itemId), () => -1),
      0
    )
  )(itemId);
  return (PROFILE_SUBSCRIPTION_CATEGORIES[platform] as readonly string[]).includes(category) ? category : undefined;
};

/** Identity of the host competing for the feed-check leader role. */
export type { LeaderKind, LeaderState } from "./Subscription.model.js";

export const DEFAULT_LEADER_HEARTBEAT_MS = 30_000;
export const DEFAULT_LEADER_LOCK_TTL_MS = 90_000;
export const DEFAULT_FEED_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3h
/** Scheduler wake-up cadence; each tick checks only subscriptions that are due. */
export const DEFAULT_SCHEDULER_TICK_MS = 5 * 60 * 1000;
export const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;
export const MAX_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** Interval choices offered by the form; any value in [MIN, MAX] is accepted. */
export const CHECK_INTERVAL_PRESETS_MS = [
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;
export const DEFAULT_REFRESH_DEDUPE_WINDOW_MS = 30_000;
export const DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE = "%(uploader)s/%(title)s.%(ext)s";
export const SUBSCRIPTION_DUPLICATE_FEED_ERROR = "SUBSCRIPTION_DUPLICATE_FEED_URL";

/**
 * Decision returned by the auto-download policy. Hosts feed each item to the
 * task queue with `priority = 10` and `groupKey = subscription.id`. The
 * decision itself is host-neutral; how the host actually enqueues is its job.
 */
export type { AutoDownloadDecision } from "./Subscription.model.js";

export const profileItemCategory: {
  (platform: SubscriptionPlatform, itemId: string): string | undefined;
  (itemId: string): (platform: SubscriptionPlatform) => string | undefined;
} = dual(2, itemCategory);
