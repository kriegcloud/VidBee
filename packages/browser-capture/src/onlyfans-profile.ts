import { isOnlyFansSite, onlyFansChatTargets, onlyFansProfile } from "@vidbee/downloader-core/onlyfans-profile";
import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as Str from "effect/String";
import { browserProfilesLayer } from "./BrowserProfiles.layer.js";
import type { OnlyFansChatRoute, OnlyFansItem, OnlyFansProfile } from "@vidbee/downloader-core/onlyfans-profile";

const record = (value: unknown): Record<string, unknown> => (P.isObject(value) ? value : {});
const id = (value: unknown): string | null =>
  (typeof value === "string" || typeof value === "number") && /^\d+$/.test(String(value)) ? String(value) : null;

/** Only signed media URLs from the site's CDN are eligible; never send account cookies. */
export function onlyFansMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      /^cdn\d*\.onlyfans\.com$/.test(url.hostname) &&
      !P.isTruthy(url.username) &&
      !P.isTruthy(url.password) &&
      !P.isTruthy(url.port) &&
      Str.startsWith("/files/")(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Extract references only. Signed CDN URLs live in memory and are not saved in profiles. */
export function onlyFansItems(payload: unknown): {
  item: OnlyFansItem;
  mediaUrl: string | null;
}[] {
  const body = record(payload);
  const entries = Option.getOrUndefined(
    A.findFirst(
      A.map(["list", "items", "data", "media", "messages", "posts"], (key) => body[key]),
      (value): value is unknown[] => A.isArray(value)
    )
  );
  const posts = A.isArray(payload)
    ? payload
    : P.isTruthy(id(body.id)) && A.isArray(body.media)
      ? [body]
      : (entries ?? [body]);
  const output: {
    item: OnlyFansItem;
    mediaUrl: string | null;
  }[] = [];
  for (const value of posts) {
    const post = record(value);
    const postId = id(post.id);
    const mediaEntries = A.isArray(post.media) ? post.media : [post];
    if (postId === null || !P.isTruthy(postId)) {
      continue;
    }
    for (const raw of mediaEntries) {
      const media = record(raw);
      const mediaId = id(media.id);
      if (mediaId === null || !P.isTruthy(mediaId) || !A.contains(["photo", "gif", "video"], String(media.type))) {
        continue;
      }
      const files = record(media.files);
      const full = record(files.full);
      const sources = record(media.videoSources);
      const candidate = Option.getOrUndefined(
        A.findFirst(
          A.map(
            R.toEntries(sources).sort(([a], [b]) => Number(b) - Number(a)),
            ([, url]) => onlyFansMediaUrl(url)
          ),
          Boolean
        )
      );
      const mediaUrl =
        onlyFansMediaUrl(full.url) ??
        onlyFansMediaUrl(record(files.source).url) ??
        onlyFansMediaUrl(media.src) ??
        candidate ??
        null;
      const drm = R.keys(record(files.drm)).length > 0;
      output.push({
        item: {
          id: mediaId,
          postId: id(post.messageId) ?? id(post.postId) ?? postId,
          category: media.type === "video" ? "videos" : "photos",
          state:
            media.canView === false || post.canViewMedia === false
              ? "locked"
              : P.isTruthy(mediaUrl)
                ? "available"
                : drm
                  ? "drm"
                  : "locked",
          downloaded: false,
        },
        mediaUrl: media.canView === false || post.canViewMedia === false ? null : mediaUrl,
      });
    }
  }
  return output;
}
export type { ChatVideoAttachment } from "./Profile.model.js";

import type { ChatVideoAttachment } from "./Profile.model.js";

const previewPath = (media: Record<string, unknown>): string | null => {
  const files = record(media.files);
  for (const key of ["thumb", "preview", "squarePreview", "miniPreview"]) {
    const raw = record(files[key]).url;
    if (typeof raw !== "string") {
      continue;
    }
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" && /^cdn\d*\.onlyfans\.com$/.test(url.hostname)) {
        return url.pathname;
      }
    } catch {
      /* ignore unreadable preview urls */
    }
  }
  return null;
};

/**
 * Videos in the order `onlyFansItems` walks a chat message payload.
 * Photos and other attachments are skipped and do not shift the index.
 */
export function chatVideoAttachments(payload: unknown): ChatVideoAttachment[] {
  const body = record(payload);
  const posts = A.isArray(body.list) ? body.list : [body];
  const extras = MutableHashMap.empty<
    string,
    {
      durationSec: number | null;
      previewPath: string | null;
    }
  >();
  for (const value of posts) {
    const post = record(value);
    if (!A.isArray(post.media)) {
      continue;
    }
    for (const raw of post.media) {
      const media = record(raw);
      const mediaId = id(media.id);
      if (!(P.isTruthy(mediaId) && media.type === "video")) {
        continue;
      }
      const duration = Number(media.duration);
      MutableHashMap.set(extras, mediaId, {
        durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
        previewPath: previewPath(media),
      });
    }
  }
  return A.map(
    A.filter(onlyFansItems(payload), ({ item }) => item.category === "videos"),
    ({ item }) => {
      const extra = Option.getOrUndefined(MutableHashMap.get(extras, item.id));
      return {
        id: item.id,
        postId: item.postId,
        state: item.state,
        durationSec: extra?.durationSec ?? null,
        previewPath: extra?.previewPath ?? null,
      };
    }
  );
}

/** 1-based video index in message-list order. A missing index is null, not a later video. */
function chatVideoByOrdinalDataFirst(payload: unknown, ordinal: number): ChatVideoAttachment | null {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    return null;
  }
  return chatVideoAttachments(payload)[ordinal - 1] ?? null;
}

/** Match only the selected conversation, never the chat list or another conversation. */
function onlyFansChatResponseDataFirst(url: URL, chatId: string): boolean {
  return url.origin === "https://onlyfans.com" && url.pathname === `/api2/v2/chats/${chatId}/messages`;
}
function onlyFansChatMediaResponseDataFirst(url: URL, chatId: string, route?: OnlyFansChatRoute): boolean {
  if (url.origin !== "https://onlyfans.com" || url.pathname !== `/api2/v2/chats/${chatId}/media`) {
    return false;
  }
  if (route === undefined || !P.isTruthy(route)) {
    return true;
  }
  const target = onlyFansChatTargets[route];
  return target.feed === "media";
}
function onlyFansPurchasedResponseDataFirst(url: URL, userId: string): boolean {
  if (url.origin !== "https://onlyfans.com" || url.pathname !== "/api2/v2/posts/paid") {
    return false;
  }
  const requestedUser =
    url.searchParams.get("userId") ?? url.searchParams.get("user_id") ?? url.searchParams.get("user");
  return requestedUser === userId;
}
function onlyFansMessageUrl(item: OnlyFansItem, profile: OnlyFansProfile): string | null {
  if (!P.isTruthy(profile.chatId)) {
    return null;
  }
  const base = `https://onlyfans.com/my/chats/chat/${profile.chatId}`;
  return P.isTruthy(profile.chatRoute) && profile.chatRoute !== "messages"
    ? `${base}/media/${item.id}`
    : `${base}?firstId=${item.postId}`;
}
export interface BrowserProfileAdapter {
  complete: (payload: unknown) => boolean;
  feedResponse: (url: URL, ownerId: string, profile: OnlyFansProfile) => boolean;
  isSite: typeof isOnlyFansSite;
  items: typeof onlyFansItems;
  key: string;
  name: string;
  normalize: typeof onlyFansProfile;
  origin: string;
  ownerId: (payload: unknown, username: string) => string | null;
  ownerResponse: (url: URL, username: string) => boolean;
  queueUrl: (item: OnlyFansItem, profile: OnlyFansProfile) => string;
  refreshResponse: (url: URL, item: OnlyFansItem, profile: OnlyFansProfile) => boolean;
  refreshUrl: (item: OnlyFansItem, profile: OnlyFansProfile) => string;
  requiresCookies: boolean;
  scrollMode: (profile: OnlyFansProfile) => {
    nested: boolean;
    chat: boolean;
  };
}
export const onlyFansAdapter: BrowserProfileAdapter = {
  name: "OnlyFans",
  key: "onlyfans",
  origin: "https://onlyfans.com",
  normalize: onlyFansProfile,
  isSite: isOnlyFansSite,
  items: onlyFansItems,
  ownerResponse: (url, username) =>
    url.origin === "https://onlyfans.com" && url.pathname === `/api2/v2/users/${username}`,
  ownerId: (payload) => id(record(payload).id),
  feedResponse: (url, ownerId, profile) =>
    profile.chatId !== undefined && P.isTruthy(profile.chatId)
      ? profile.chatRoute !== undefined &&
        P.isTruthy(profile.chatRoute) &&
        onlyFansChatTargets[profile.chatRoute].feed === "media"
        ? onlyFansChatMediaResponseDataFirst(url, profile.chatId, profile.chatRoute)
        : onlyFansChatResponseDataFirst(url, profile.chatId)
      : profile.purchasedUserId !== undefined && P.isTruthy(profile.purchasedUserId)
        ? onlyFansPurchasedResponseDataFirst(url, profile.purchasedUserId)
        : url.origin === "https://onlyfans.com" && Str.startsWith(`/api2/v2/users/${ownerId}/posts`)(url.pathname),
  complete: (payload) => record(payload).hasMore === false,
  queueUrl: (item, profile) =>
    onlyFansMessageUrl(item, profile) ??
    (profile.purchasedUserId !== undefined && P.isTruthy(profile.purchasedUserId)
      ? `${profile.profileUrl}#media=${item.id}`
      : `https://onlyfans.com/${item.postId}/${profile.username}`),
  refreshUrl: (item, profile) =>
    onlyFansMessageUrl(item, profile) ??
    (profile.purchasedUserId !== undefined && P.isTruthy(profile.purchasedUserId)
      ? profile.profileUrl
      : `https://onlyfans.com/${item.postId}/${profile.username}`),
  refreshResponse: (url, item, profile) =>
    profile.chatId !== undefined && P.isTruthy(profile.chatId)
      ? onlyFansChatResponseDataFirst(url, profile.chatId) ||
        onlyFansChatMediaResponseDataFirst(url, profile.chatId) ||
        (url.origin === "https://onlyfans.com" &&
          (url.pathname === `/api2/v2/chats/${profile.chatId}/messages/${item.postId}` ||
            url.pathname === `/api2/v2/chats/${profile.chatId}/media/${item.id}`))
      : profile.purchasedUserId !== undefined && P.isTruthy(profile.purchasedUserId)
        ? onlyFansPurchasedResponseDataFirst(url, profile.purchasedUserId)
        : url.origin === "https://onlyfans.com" && url.pathname === `/api2/v2/posts/${item.postId}`,
  scrollMode: (profile) => ({
    nested: P.isTruthy(profile.chatId || profile.purchasedUserId),
    chat: P.isTruthy(
      profile.chatId &&
        (profile.chatRoute === undefined ||
          !P.isTruthy(profile.chatRoute) ||
          onlyFansChatTargets[profile.chatRoute].feed === "messages")
    ),
  }),
  requiresCookies: true,
};
export const chatVideoByOrdinal: {
  (ordinal: number): (payload: unknown) => ChatVideoAttachment | null;
  (payload: unknown, ordinal: number): ChatVideoAttachment | null;
} = dual(2, chatVideoByOrdinalDataFirst);
export const onlyFansChatResponse: {
  (chatId: string): (url: URL) => boolean;
  (url: URL, chatId: string): boolean;
} = dual(2, onlyFansChatResponseDataFirst);
export const onlyFansChatMediaResponse: {
  (chatId: string, route?: OnlyFansChatRoute): (url: URL) => boolean;
  (url: URL, chatId: string, route?: OnlyFansChatRoute): boolean;
} = dual(
  (args) => args.length >= 3 || (args.length >= 2 && typeof args[0] !== "string"),
  onlyFansChatMediaResponseDataFirst
);
export const onlyFansPurchasedResponse: {
  (userId: string): (url: URL) => boolean;
  (url: URL, userId: string): boolean;
} = dual(2, onlyFansPurchasedResponseDataFirst);

export { BrowserProfiles, ProfileCodec, ProfileHost, ProfileQueue } from "./BrowserProfiles.service.js";
export { ProfileExecutorLive } from "./ProfileExecutor.layer.js";
export { ProfileExecutorOptions } from "./ProfileExecutor.service.js";
export { ProfileExecutorNativeDependencies } from "./ProfileExecutorNative.layer.js";
export const onlyFansProfilesLayer = (storageDir: string) =>
  browserProfilesLayer({ storageDir, adapter: onlyFansAdapter });
