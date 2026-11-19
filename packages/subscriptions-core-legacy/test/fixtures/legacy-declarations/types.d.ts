// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
/**
 * Canonical domain model for @vidbee/subscriptions-core.
 *
 * Authoritative spec: NEX-132 issue body (`Phase A · packages/subscriptions-core`)
 * and `docs/vidbee-desktop-first-cli-ytdlp-rss-design.md` §7.
 *
 * Adapters in apps/desktop, apps/api and apps/cli MUST consume these types
 * directly; any host-local divergence is a contract bug.
 */
import type { OneClickContainerOption, OneClickQualityPreset } from '@vidbee/downloader-core/format-preferences';
export type FeedPlatform = 'youtube' | 'bilibili' | 'custom';
/** Accounts checked through VidBee's profile mappers instead of an RSS feed. */
export type ProfilePlatform = 'instagram' | 'threads' | 'x' | 'tiktok' | 'snapchat';
export type SubscriptionPlatform = FeedPlatform | ProfilePlatform;
export type SubscriptionSourceKind = 'feed' | 'profile';
/**
 * Categories a profile subscription can follow, per platform. The resolver,
 * the form dialog, the desktop fetcher and input validation all read this one
 * catalog. Snapchat `stories` covers the current story and saved highlights;
 * X `posts-with-media` is the Posts tab kept to entries that carry media.
 */
export declare const PROFILE_SUBSCRIPTION_CATEGORIES: {
    readonly instagram: readonly ["stories", "highlights", "posts", "reels", "tagged"];
    readonly tiktok: readonly ["stories", "posts"];
    readonly snapchat: readonly ["stories", "spotlight"];
    readonly threads: readonly ["media"];
    readonly x: readonly ["posts-with-media", "media"];
};
export type ProfileSubscriptionCategory<P extends ProfilePlatform = ProfilePlatform> = (typeof PROFILE_SUBSCRIPTION_CATEGORIES)[P][number];
export declare const PROFILE_PLATFORMS: readonly ProfilePlatform[];
export declare const isProfilePlatform: (value: string | null | undefined) => value is ProfilePlatform;
/** Synthetic feed URL for profile sources; keeps duplicate detection by feed URL. */
export declare const PROFILE_FEED_URL_PROTOCOL = "vidbee-profile:";
/** Per-subscription overrides; omitted values follow the host's download defaults. */
export interface SubscriptionDownloadPreferences {
    downloadType?: 'video' | 'audio' | 'subtitles';
    downloadQuality?: OneClickQualityPreset;
    downloadContainer?: OneClickContainerOption;
}
/**
 * High-level subscription state. The granular task lifecycle for a
 * subscription item is owned by `@vidbee/task-queue-legacy` (see `TaskStatus`); this
 * field describes only the result of the most recent feed-check, not
 * individual items.
 */
export type SubscriptionStatus = 'idle' | 'checking' | 'up-to-date' | 'failed' | 'rate-limited' | 'auth-required';
/** Returned by `feed-resolver` from a raw user-entered URL. */
export interface ResolvedFeed {
    sourceUrl: string;
    feedUrl: string;
    platform: SubscriptionPlatform;
    sourceKind: SubscriptionSourceKind;
    /** Canonical account handle for profile sources. */
    profileOwner?: string;
    /** Categories the profile source offers; empty for feeds. */
    availableCategories: string[];
}
export interface SubscriptionRule extends SubscriptionDownloadPreferences {
    id: string;
    title: string;
    sourceUrl: string;
    feedUrl: string;
    platform: SubscriptionPlatform;
    keywords: string[];
    tags: string[];
    onlyDownloadLatest: boolean;
    /** When false, feed items are listed but not queued automatically. */
    autoDownload: boolean;
    enabled: boolean;
    coverUrl?: string;
    latestVideoTitle?: string;
    latestVideoPublishedAt?: number;
    lastCheckedAt?: number;
    lastSuccessAt?: number;
    status: SubscriptionStatus;
    lastError?: string;
    createdAt: number;
    updatedAt: number;
    downloadDirectory?: string;
    namingTemplate?: string;
    sourceKind: SubscriptionSourceKind;
    profileOwner?: string;
    /** Followed categories, a subset of `PROFILE_SUBSCRIPTION_CATEGORIES`; [] for feeds. */
    categories: string[];
    /** Null/undefined follows `DEFAULT_FEED_CHECK_INTERVAL_MS`. */
    checkIntervalMs?: number;
    /** Earliest time of the next scheduled check (interval or rate-limit retry). */
    nextCheckAt?: number;
}
export interface SubscriptionFeedItem {
    /**
     * Stable id within a subscription (yt:videoId / guid / link). Profile items
     * use `<category>:<platform item id>`; see `profileItemCategory`.
     */
    id: string;
    url: string;
    title: string;
    publishedAt: number;
    thumbnail?: string;
    /**
     * True while this item is linked to a task that still exists.
     * The row itself is the already-seen history: clearing this flag allows a
     * manual re-add and does not make the next feed check download it again.
     */
    addedToQueue: boolean;
    /** Task id while the item is queued. Cleared when that task is removed. */
    taskId?: string;
}
export interface SubscriptionWithItems extends SubscriptionRule {
    items: SubscriptionFeedItem[];
}
export interface SubscriptionCreateInput extends SubscriptionDownloadPreferences {
    sourceUrl: string;
    feedUrl: string;
    platform: SubscriptionPlatform;
    title?: string;
    keywords?: string[];
    tags?: string[];
    onlyDownloadLatest?: boolean;
    autoDownload?: boolean;
    downloadDirectory?: string;
    namingTemplate?: string;
    enabled?: boolean;
    sourceKind?: SubscriptionSourceKind;
    profileOwner?: string;
    categories?: string[];
    checkIntervalMs?: number;
}
export interface SubscriptionUpdateInput extends SubscriptionDownloadPreferences {
    title?: string;
    sourceUrl?: string;
    feedUrl?: string;
    platform?: SubscriptionPlatform;
    keywords?: string[];
    tags?: string[];
    onlyDownloadLatest?: boolean;
    autoDownload?: boolean;
    enabled?: boolean;
    downloadDirectory?: string;
    namingTemplate?: string;
    categories?: string[];
    /** Null clears the override back to the default interval. */
    checkIntervalMs?: number | null;
}
/** Raw RSS-parser item shape we read into. Hosts may pass extras. */
export interface ParsedFeedItem {
    title?: string;
    link?: string;
    guid?: string;
    id?: string;
    isoDate?: string;
    pubDate?: string;
    youtubeId?: string;
    content?: string;
    contentSnippet?: string;
    contentEncoded?: string;
    summary?: string;
    description?: string;
    mediaThumbnail?: Array<{
        url?: string;
    }> | {
        url?: string;
    };
    mediaContent?: Array<{
        url?: string;
    }> | {
        url?: string;
    };
    enclosure?: Array<{
        url?: string;
        type?: string;
    }> | {
        url?: string;
        type?: string;
    };
    /** Podcast episode artwork (`itunes:image` href or nested `{ href }` / `{ url }`). */
    itunes?: {
        image?: string | {
            href?: string;
            url?: string;
        };
    };
    [key: string]: unknown;
}
export interface ParsedFeed {
    title?: string;
    link?: string;
    image?: {
        url?: string;
    };
    itunes?: {
        image?: string;
    };
    items: ParsedFeedItem[];
}
export interface NormalizedFeedItem {
    id: string;
    url: string;
    title: string;
    publishedAt: number;
    thumbnail?: string;
}
/** One mapped profile entry, already scoped to a followed category. */
export interface ProfileFeedItem {
    /** Platform-native id (post id, snap file id, canonical post URL...). */
    id: string;
    category: string;
    url: string;
    title?: string;
    /** Epoch ms when the platform exposes it; discovery time otherwise. */
    publishedAt?: number;
    thumbnail?: string;
    /**
     * The URL is a collection whose content changes (an Instagram highlight)
     * and `id` carries its content version. A new version is queued even though
     * the URL was downloaded before.
     */
    versioned?: boolean;
}
export type ProfileCategoryError = 'rate-limited' | 'auth-required' | 'error';
export interface ProfileCheckResult {
    title?: string;
    avatarUrl?: string;
    /** Items from every category that mapped (fully or partially). */
    items: ProfileFeedItem[];
    /** Categories that failed this check; their known items stay untouched. */
    categoryErrors: Partial<Record<string, ProfileCategoryError>>;
    /** Error text for the most severe failed category. */
    error?: string;
    /** Epoch ms before which the platform should not be asked again. */
    retryAfter?: number;
}
/** Host seam that checks a profile subscription through VidBee's mappers. */
export interface ProfileSourceFetcher {
    fetch(subscription: SubscriptionRule, signal: AbortSignal): Promise<ProfileCheckResult>;
}
export declare const profileItemId: (category: string, id: string) => string;
/** Category of a profile item id, or undefined for feed items and unknown prefixes. */
export declare const profileItemCategory: (platform: SubscriptionPlatform, itemId: string) => string | undefined;
/** Identity of the host competing for the feed-check leader role. */
export type LeaderKind = 'desktop' | 'api';
export interface LeaderState {
    kind: LeaderKind | null;
    pid: number | null;
    startedAt: number | null;
    heartbeatAt: number | null;
    lockExpiresAt: number | null;
    /** Random per acquisition; the lease holder uses this as a CAS guard. */
    leaseId: string | null;
    /** Operator override. */
    preferred: LeaderKind | null;
}
export interface LeaderAcquireOptions {
    kind: LeaderKind;
    pid: number;
    /** Defaults to 30_000ms. */
    heartbeatIntervalMs?: number;
    /** Defaults to 90_000ms. */
    lockTtlMs?: number;
    now?: () => number;
}
export declare const DEFAULT_LEADER_HEARTBEAT_MS = 30000;
export declare const DEFAULT_LEADER_LOCK_TTL_MS = 90000;
export declare const DEFAULT_FEED_CHECK_INTERVAL_MS: number;
/** Scheduler wake-up cadence; each tick checks only subscriptions that are due. */
export declare const DEFAULT_SCHEDULER_TICK_MS: number;
export declare const MIN_CHECK_INTERVAL_MS: number;
export declare const MAX_CHECK_INTERVAL_MS: number;
/** Interval choices offered by the form; any value in [MIN, MAX] is accepted. */
export declare const CHECK_INTERVAL_PRESETS_MS: readonly [number, number, number, number, number];
export declare const DEFAULT_REFRESH_DEDUPE_WINDOW_MS = 30000;
export declare const DEFAULT_SUBSCRIPTION_FILENAME_TEMPLATE = "%(uploader)s/%(title)s.%(ext)s";
export declare const SUBSCRIPTION_DUPLICATE_FEED_ERROR = "SUBSCRIPTION_DUPLICATE_FEED_URL";
/**
 * Decision returned by the auto-download policy. Hosts feed each item to the
 * task queue with `priority = 10` and `groupKey = subscription.id`. The
 * decision itself is host-neutral; how the host actually enqueues is its job.
 */
export interface AutoDownloadDecision {
    subscription: SubscriptionRule;
    items: NormalizedFeedItem[];
    /**
     * The full normalized feed, used to refresh the on-disk
     * `subscription_items` snapshot independently of which items are queued.
     */
    feedItemsToPersist: NormalizedFeedItem[];
    /** Most recent published-at across the normalized feed. */
    latestPublishedAt: number | null;
    /** Title of the newest feed item, or undefined when the feed is empty. */
    latestVideoTitle?: string;
    /** Resolved cover URL (feed image / itunes / first thumbnail). */
    coverUrl?: string;
}
