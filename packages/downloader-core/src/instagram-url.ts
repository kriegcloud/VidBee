import * as A from "effect/Array";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Str from "effect/String";
import type { InstagramProfileCategory } from "./types.js";

const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_HOSTS = MutableHashSet.fromIterable([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);
const RESERVED_PROFILE_PATHS = MutableHashSet.fromIterable([
  "accounts",
  "about",
  "developer",
  "direct",
  "directory",
  "emails",
  "explore",
  "legal",
  "p",
  "press",
  "privacy",
  "reel",
  "reels",
  "share",
  "stories",
  "tv",
  "web",
]);

export const INSTAGRAM_PROFILE_CATEGORIES: readonly InstagramProfileCategory[] = [
  "highlights",
  "posts",
  "reels",
  "tagged",
  "stories",
];

/** Instagram account URL (any profile tab or story alias) → canonical profile. */
export const normalizeInstagramProfileUrl = (value: string): { username: string; profileUrl: string } | null => {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      (parsed.username !== undefined && parsed.username !== null && parsed.username !== "") ||
      (parsed.password !== undefined && parsed.password !== null && parsed.password !== "") ||
      (parsed.port !== undefined && parsed.port !== null && parsed.port !== "")
    ) {
      return null;
    }
    if (!MutableHashSet.has(INSTAGRAM_HOSTS, Str.toLowerCase(parsed.hostname))) {
      return null;
    }
    let segments = A.filter(Str.split(parsed.pathname, "/"), Boolean);
    const [first, second] = segments;
    if (
      segments.length === 2 &&
      first === "stories" &&
      second !== undefined &&
      second !== null &&
      second !== "" &&
      second !== "highlights"
    ) {
      segments = [second];
    }
    if (
      segments.length === 2 &&
      first !== undefined &&
      first !== null &&
      first !== "" &&
      INSTAGRAM_PROFILE_CATEGORIES.includes(segments[1] as InstagramProfileCategory)
    ) {
      segments = [first];
    }
    const username = segments.length === 1 ? segments[0] : undefined;
    if (
      !(username !== undefined && username !== null && username !== "") ||
      MutableHashSet.has(RESERVED_PROFILE_PATHS, Str.toLowerCase(username)) ||
      !INSTAGRAM_USERNAME_PATTERN.test(username)
    ) {
      return null;
    }
    return {
      username: Str.toLowerCase(username),
      profileUrl: `https://www.instagram.com/${Str.toLowerCase(username)}/`,
    };
  } catch {
    return null;
  }
};
