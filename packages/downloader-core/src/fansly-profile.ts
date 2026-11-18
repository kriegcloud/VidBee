import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as A from "effect/Array";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { OnlyFansAction } from "./onlyfans-profile.js";
import type { OnlyFansDownloadSchema } from "./onlyfans-profile.js";
export const FanslyCategory = LiteralKit(["posts", "media"]);
export const FanslyCommandSchema = S.Struct({
  url: S.String.pipe(S.mutableKey),
  action: OnlyFansAction.pipe(S.mutableKey),
  category: FanslyCategory.pipe(S.optional, S.mutableKey),
});
export type FanslyCommand = typeof FanslyCommandSchema.Type;
export type FanslyDownload = typeof OnlyFansDownloadSchema.Type;

export function fanslyProfile(value: string): { username: string; profileUrl: string } | null {
  try {
    const url = new URL(value);
    const parts = A.filter(Str.split(url.pathname, "/"), Boolean);
    if (
      !(["https:", "http:"].includes(url.protocol) && ["fansly.com", "www.fansly.com"].includes(url.hostname)) ||
      (url.username !== undefined && url.username !== null && url.username !== "") ||
      (url.password !== undefined && url.password !== null && url.password !== "") ||
      (url.port !== undefined && url.port !== null && url.port !== "") ||
      parts.length < 1 ||
      parts.length > 2 ||
      (parts.length === 2 && !["posts", "media"].includes(parts[1] ?? ""))
    ) {
      return null;
    }
    const username = Str.toLowerCase(parts[0] ?? "");
    if (
      !/^[a-z0-9_]{1,64}$/.test(username) ||
      /^\d+$/.test(username) ||
      [
        "home",
        "login",
        "signup",
        "register",
        "post",
        "messages",
        "notifications",
        "settings",
        "explore",
        "search",
        "subscriptions",
        "collections",
      ].includes(username)
    ) {
      return null;
    }
    return { username, profileUrl: `https://fansly.com/${username}` };
  } catch {
    return null;
  }
}
export function isFanslySite(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "fansly.com" || Str.endsWith(".fansly.com")(host);
  } catch {
    return false;
  }
}
