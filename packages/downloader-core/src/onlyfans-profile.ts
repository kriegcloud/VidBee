import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { InvalidDownload } from "./Downloader.errors.js";

export const OnlyFansCategorySchema = LiteralKit(["photos", "videos"]);
export const OnlyFansScanSchema = LiteralKit(["media", "photos", "videos", "posts"]);
export const onlyFansChatRoutes = ["messages", "gallery", "opened", "purchased", "photos", "videos"] as const;
export type OnlyFansChatRoute = (typeof onlyFansChatRoutes)[number];
// Every gallery route shares the chat's /media feed; photos and videos are
// split by item category while collecting, not by a server-side filter.
export const onlyFansChatTargets: Record<OnlyFansChatRoute, { path: string; feed: "messages" | "media" }> = {
  messages: { path: "", feed: "messages" },
  gallery: { path: "/gallery", feed: "media" },
  opened: { path: "/gallery/opened", feed: "media" },
  purchased: { path: "/gallery/purchased", feed: "media" },
  photos: { path: "/gallery/photos", feed: "media" },
  videos: { path: "/gallery/videos", feed: "media" },
};

export const onlyFansChatUrl: {
  (route: OnlyFansChatRoute): (chatId: string) => string;
  (chatId: string, route: OnlyFansChatRoute): string;
} = dual(
  2,
  (chatId: string, route: OnlyFansChatRoute): string =>
    `https://onlyfans.com/my/chats/chat/${chatId}${onlyFansChatTargets[route].path}`
);
export const onlyFansPurchasedRoutes = ["all", "photos", "videos", "posts", "messages"] as const;
export type OnlyFansPurchasedRoute = (typeof onlyFansPurchasedRoutes)[number];
export const onlyFansPurchasedTargets: Record<OnlyFansPurchasedRoute, string> = {
  all: "",
  photos: "?postType=photos",
  videos: "?postType=videos",
  posts: "?entityType=posts",
  messages: "?entityType=messages",
};

export const onlyFansPurchasedUrl: {
  (route: OnlyFansPurchasedRoute): (userId: string) => string;
  (userId: string, route: OnlyFansPurchasedRoute): string;
} = dual(
  2,
  (userId: string, route: OnlyFansPurchasedRoute): string =>
    `https://onlyfans.com/my/collections/user-lists/purchased/posts/${userId}${onlyFansPurchasedTargets[route]}`
);
export const OnlyFansChatRouteSchema = LiteralKit(onlyFansChatRoutes);
export const OnlyFansPurchasedRouteSchema = LiteralKit(onlyFansPurchasedRoutes);
export const OnlyFansItemState = LiteralKit(["available", "locked", "drm", "unsupported"]);
export const OnlyFansProfileState = LiteralKit(["idle", "mapping", "partial", "complete", "auth-required", "error"]);
export const OnlyFansAction = LiteralKit(["get", "open", "map", "stop"]);
export const OnlyFansItemSchema = S.Struct({
  id: S.String.pipe(S.mutableKey),
  postId: S.String.pipe(S.mutableKey),
  category: OnlyFansCategorySchema.pipe(S.mutableKey),
  state: OnlyFansItemState.pipe(S.mutableKey),
  downloaded: S.Boolean.pipe(S.mutableKey),
});
export const OnlyFansProfileSchema = S.Struct({
  username: S.String.pipe(S.mutableKey),
  profileUrl: S.String.pipe(S.mutableKey),
  chatId: S.String.pipe(S.optional, S.mutableKey),
  chatRoute: OnlyFansChatRouteSchema.pipe(S.optional, S.mutableKey),
  purchasedUserId: S.String.pipe(S.optional, S.mutableKey),
  purchasedRoute: OnlyFansPurchasedRouteSchema.pipe(S.optional, S.mutableKey),
  creatorUsername: S.String.pipe(S.optional, S.mutableKey),
  linkedChatId: S.String.pipe(S.optional, S.mutableKey),
  state: OnlyFansProfileState.pipe(S.mutableKey),
  category: OnlyFansScanSchema.pipe(S.optional, S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey),
  pages: S.Finite.pipe(S.mutableKey),
  items: S.Array(OnlyFansItemSchema).pipe(S.mutable, S.mutableKey),
  error: S.String.pipe(S.optional, S.mutableKey),
});
export const OnlyFansCommandSchema = S.Struct({
  url: S.String.pipe(S.mutableKey),
  action: OnlyFansAction.pipe(S.mutableKey),
  category: OnlyFansScanSchema.pipe(S.optional, S.mutableKey),
});
export const OnlyFansDownloadSchema = S.Struct({
  url: S.String.pipe(S.mutableKey),
  itemIds: S.Array(S.String).pipe(S.mutable, S.mutableKey),
  customDownloadPath: S.String.pipe(S.optional, S.mutableKey),
});
export type OnlyFansProfile = typeof OnlyFansProfileSchema.Type;
export type OnlyFansItem = typeof OnlyFansItemSchema.Type;
export type OnlyFansCommand = typeof OnlyFansCommandSchema.Type;
export type OnlyFansDownload = typeof OnlyFansDownloadSchema.Type;

const RESERVED = MutableHashSet.fromIterable([
  "my",
  "api",
  "api2",
  "login",
  "signup",
  "notifications",
  "settings",
  "help",
  "terms",
  "privacy",
  "search",
]);

export function onlyFansProfile(value: string): {
  username: string;
  profileUrl: string;
  chatId?: string;
  chatRoute?: OnlyFansChatRoute;
  purchasedUserId?: string;
  purchasedRoute?: OnlyFansPurchasedRoute;
} | null {
  try {
    const url = new URL(value);
    const parts = A.filter(Str.split(url.pathname, "/"), Boolean);
    if (
      !(["https:", "http:"].includes(url.protocol) && ["onlyfans.com", "www.onlyfans.com"].includes(url.hostname)) ||
      (url.username !== undefined && url.username !== null && url.username !== "") ||
      (url.password !== undefined && url.password !== null && url.password !== "") ||
      (url.port !== undefined && url.port !== null && url.port !== "")
    ) {
      return null;
    }
    if (A.join(parts.slice(0, 3), "/") === "my/chats/chat" && /^\d{1,20}$/.test(parts[3] ?? "")) {
      const chatId = parts[3] ?? "";
      if (parts.length === 4) {
        return { username: chatId, chatId, profileUrl: onlyFansChatUrl(chatId, "messages") };
      }
      const suffix = `/${A.join(parts.slice(4), "/")}`;
      const route = Option.getOrUndefined(
        A.findFirst(
          onlyFansChatRoutes,
          (candidate) => candidate !== "messages" && onlyFansChatTargets[candidate].path === suffix
        )
      );
      if (!(route !== undefined)) {
        return null;
      }
      return {
        username: chatId,
        chatId,
        chatRoute: route,
        profileUrl: onlyFansChatUrl(chatId, route),
      };
    }
    if (
      A.join(parts.slice(0, 5), "/") === "my/collections/user-lists/purchased/posts" &&
      parts.length === 6 &&
      /^\d{1,20}$/.test(parts[5] ?? "")
    ) {
      const userId = parts[5] ?? "";
      const filters = url.searchParams;
      const route = Option.getOrUndefined(
        A.findFirst(
          onlyFansPurchasedRoutes,
          (candidate) => Str.slice(1)(onlyFansPurchasedTargets[candidate]) === filters.toString()
        )
      );
      if (!(route !== undefined)) {
        return null;
      }
      return {
        username: userId,
        purchasedUserId: userId,
        purchasedRoute: route,
        profileUrl: onlyFansPurchasedUrl(userId, route),
      };
    }
    if (
      parts.length < 1 ||
      parts.length > 2 ||
      (parts.length === 2 && !["media", "photos", "videos", "posts"].includes(parts[1] ?? ""))
    ) {
      return null;
    }
    const username = Str.toLowerCase(parts[0] ?? "");
    if (!/^[a-z0-9._-]{1,64}$/.test(username) || /^\d+$/.test(username) || MutableHashSet.has(RESERVED, username)) {
      return null;
    }
    return { username, profileUrl: `https://onlyfans.com/${username}` };
  } catch {
    return null;
  }
}

export function isOnlyFansSite(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "onlyfans.com" || Str.endsWith(".onlyfans.com")(host);
  } catch {
    return false;
  }
}

/** API sessions must stay in the browser that created them. */
export function assertOnlyFansBrowserSession(value: string): Result.Result<void, InvalidDownload> {
  return isOnlyFansSite(value)
    ? Result.fail(
        InvalidDownload.make({
          operation: "onlyfans-browser-session",
          legacyMessage:
            "OnlyFans requires the dedicated browser session. Open the OnlyFans profile in VidBeep, choose Open browser, sign in there, and map its photos or videos. Imported Chrome cookies are not used for OnlyFans.",
        })
      )
    : Result.succeed(undefined);
}
