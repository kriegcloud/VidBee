import * as MutableHashSet from "effect/MutableHashSet";
import * as Str from "effect/String";

const DZEN_HOSTS = MutableHashSet.fromIterable(["dzen.ru", "www.dzen.ru", "zen.yandex.ru"]);
const DZEN_CHANNEL_ID = /^[a-f0-9]{24}$/i;
const DZEN_CHANNEL_NAME = /^[a-z0-9_-]+$/i;
const DZEN_RESERVED_PATHS = MutableHashSet.fromIterable([
  "id",
  "video",
  "media",
  "watch",
  "shorts",
  "articles",
  "news",
  "search",
  "subscriptions",
  "profile",
  "settings",
  "login",
  "logout",
  "help",
  "a",
  "b",
]);

/** Normalize a Dzen channel root without claiming individual publications or site pages. */
export const normalizeDzenProfileUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (
      !(["http:", "https:"].includes(url.protocol) && MutableHashSet.has(DZEN_HOSTS, url.hostname)) ||
      (url.username !== undefined && url.username !== null && url.username !== "") ||
      (url.password !== undefined && url.password !== null && url.password !== "") ||
      (url.port !== undefined && url.port !== null && url.port !== "")
    ) {
      return null;
    }
    const pathname = Str.replace(/\/$/, "")(url.pathname);
    const parts = Str.split(Str.slice(1)(pathname), "/");
    if (parts.length === 2 && (parts[0] ?? "") === "id" && DZEN_CHANNEL_ID.test(parts[1] ?? "")) {
      return `https://dzen.ru/id/${Str.toLowerCase(parts[1] ?? "")}`;
    }
    if (
      parts.length === 1 &&
      DZEN_CHANNEL_NAME.test(parts[0] ?? "") &&
      !MutableHashSet.has(DZEN_RESERVED_PATHS, Str.toLowerCase(parts[0] ?? ""))
    ) {
      return `https://dzen.ru/${Str.toLowerCase(parts[0] ?? "")}`;
    }
    return null;
  } catch {
    return null;
  }
};
