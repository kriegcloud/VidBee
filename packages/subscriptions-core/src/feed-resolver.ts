/**
 * Resolve a user-entered URL into a normalized {sourceUrl, feedUrl, platform}.
 *
 * Ported and consolidated from `apps/desktop/src/main/lib/subscription-feed-resolver.ts`.
 * Tests guard regression on the YouTube channel/user/handle and Bilibili shapes
 * that previously fired Sentry issues VIDBEE-39A / VIDBEE-39B.
 */
import { normalizeInstagramProfileUrl } from "@vidbee/downloader-core/instagram-url";
import { normalizeSnapchatUrl } from "@vidbee/downloader-core/snapchat";
import { resolveSocialSource } from "@vidbee/downloader-core/social-media";
import { normalizeThreadsUrl } from "@vidbee/downloader-core/threads";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import { dual } from "effect/Function";
import * as O from "effect/Option";
import * as Str from "effect/String";
import { PROFILE_FEED_URL_PROTOCOL, PROFILE_SUBSCRIPTION_CATEGORIES } from "./types.js";
import type { FeedPlatform, ProfilePlatform, ResolvedFeed } from "./types.js";

const ensureUrlHasProtocol = (value: string): string => {
  if (!Boolean(value)) {
    return value;
  }
  if (!/^https?:\/\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
};

const YouTubeFeedKey = LiteralKit(["channel_id", "user"]);
const createYouTubeFeedUrl = (key: typeof YouTubeFeedKey.Type, value: string): string => {
  const feedUrl = new URL("https://www.youtube.com/feeds/videos.xml");
  feedUrl.searchParams.set(key, value);
  return feedUrl.toString();
};

const feed = (sourceUrl: string, feedUrl: string, platform: FeedPlatform): ResolvedFeed => ({
  sourceUrl,
  feedUrl,
  platform,
  sourceKind: "feed",
  availableCategories: [],
});

const profile = (platform: ProfilePlatform, owner: string, sourceUrl: string): ResolvedFeed => ({
  sourceUrl,
  feedUrl: makeProfileFeedUrl(platform, owner),
  platform,
  sourceKind: "profile",
  profileOwner: owner,
  availableCategories: [...PROFILE_SUBSCRIPTION_CATEGORIES[platform]],
});

/** Synthetic, case-folded feed URL so one account can only be subscribed once. */
const makeProfileFeedUrl = (platform: ProfilePlatform, owner: string): string =>
  `${PROFILE_FEED_URL_PROTOCOL}//${platform}/${encodeURIComponent(Str.toLowerCase(owner))}`;
export const profileFeedUrl: {
  (platform: ProfilePlatform, owner: string): string;
  (owner: string): (platform: ProfilePlatform) => string;
} = dual(2, makeProfileFeedUrl);

/**
 * Recognize an account on a platform VidBee maps itself. Any tab, post-less
 * profile alias or category URL of the account resolves to its profile page.
 */
export const resolveProfileSource = (rawUrl: string): ResolvedFeed | null => {
  const normalized = ensureUrlHasProtocol(Str.trim(rawUrl));
  const instagram = normalizeInstagramProfileUrl(normalized);
  if (instagram !== null) {
    return profile("instagram", instagram.username, instagram.profileUrl);
  }
  const threads = normalizeThreadsUrl(normalized);
  if (threads?.kind === "profile") {
    return profile("threads", threads.username, `https://www.threads.com/@${threads.username}`);
  }
  const snapchat = normalizeSnapchatUrl(normalized);
  if (snapchat !== null && ["profile", "stories", "spotlights"].includes(snapchat.kind)) {
    return profile("snapchat", snapchat.username, `https://www.snapchat.com/@${snapchat.username}`);
  }
  const social = resolveSocialSource(normalized);
  if (social !== null && (social.platform === "x" || social.platform === "tiktok") && social.categories.length > 0) {
    return social.platform === "x"
      ? profile("x", social.owner, `https://x.com/${social.owner}`)
      : profile("tiktok", social.owner, `https://www.tiktok.com/@${social.owner}`);
  }
  return null;
};

export const resolveFeedFromInput = (rawUrl: string): ResolvedFeed => {
  const normalized = ensureUrlHasProtocol(Str.trim(rawUrl));
  const profileSource = resolveProfileSource(normalized);
  if (profileSource !== null) {
    return profileSource;
  }

  const youTubeChannelMatch = O.getOrNull(Str.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/i)(normalized));
  if (youTubeChannelMatch?.[1] !== undefined && Boolean(youTubeChannelMatch[1])) {
    return feed(normalized, createYouTubeFeedUrl("channel_id", youTubeChannelMatch[1]), "youtube");
  }

  if (/youtube\.com\/feeds\/videos\.xml/i.test(normalized)) {
    return feed(normalized, normalized, "youtube");
  }

  const youTubeUserMatch = O.getOrNull(Str.match(/youtube\.com\/(?:user|c)\/([^/?]+)/i)(normalized));
  if (youTubeUserMatch?.[1] !== undefined && Boolean(youTubeUserMatch[1])) {
    return feed(normalized, createYouTubeFeedUrl("user", youTubeUserMatch[1]), "youtube");
  }

  const youTubeHandleMatch = O.getOrNull(Str.match(/youtube\.com\/(@[^/?]+)/i)(normalized));
  if (youTubeHandleMatch?.[1] !== undefined && Boolean(youTubeHandleMatch[1])) {
    const handle = Str.replace("@", "")(youTubeHandleMatch[1]);
    return feed(normalized, createYouTubeFeedUrl("user", handle), "youtube");
  }

  const biliSpaceMatch = O.getOrNull(Str.match(/bilibili\.com\/(?:space|user)\/(\d+)/i)(normalized));
  if (biliSpaceMatch?.[1] !== undefined && Boolean(biliSpaceMatch[1])) {
    return feed(normalized, `https://rsshub.app/bilibili/user/video/${biliSpaceMatch[1]}`, "bilibili");
  }

  if (/rsshub\.app\/bilibili/i.test(normalized)) {
    return feed(normalized, normalized, "bilibili");
  }

  return feed(normalized, normalized, "custom");
};

/**
 * Build a stable hash key for duplicate-feed detection. Two feeds compare
 * equal iff their host+path+query collapse to the same string after a few
 * normalization passes (case, trailing slash, missing protocol).
 */
export const buildFeedKey = (feedUrl: string): string => {
  const trimmed = Str.trim(feedUrl);
  if (!Boolean(trimmed)) {
    return "";
  }
  if (Str.startsWith(PROFILE_FEED_URL_PROTOCOL)(trimmed)) {
    return Str.toLowerCase(trimmed);
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(normalized);
    let pathname = url.pathname || "/";
    pathname = Str.replace(/\/+$/, "")(pathname);
    if (!Boolean(pathname)) {
      pathname = "/";
    }
    return `${Str.toLowerCase(url.host)}${pathname}${url.search}`;
  } catch {
    return Str.toLowerCase(trimmed);
  }
};
