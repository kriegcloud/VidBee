import * as MutableHashSet from "effect/MutableHashSet";
import * as Str from "effect/String";

const THREADS_HOSTS = MutableHashSet.fromIterable(["threads.com", "www.threads.com", "threads.net", "www.threads.net"]);
const THREADS_PATH = /^\/@([A-Za-z0-9_][A-Za-z0-9._]{0,29})(?:\/(media)|\/post\/([A-Za-z0-9_-]{5,20}))?\/?$/;

export interface NormalizedThreadsUrl {
  directorySegments: readonly string[];
  kind: "post" | "profile";
  shortcode?: string | undefined;
  url: string;
  username: string;
}

/** Threads profiles download their Media tab; replies and reposts are excluded. */
export const normalizeThreadsUrl = (value: string): NormalizedThreadsUrl | null => {
  try {
    const parsed = new URL(value);
    if (
      !(["http:", "https:"].includes(parsed.protocol) && MutableHashSet.has(THREADS_HOSTS, parsed.hostname)) ||
      (parsed.username !== undefined && parsed.username !== null && parsed.username !== "") ||
      (parsed.password !== undefined && parsed.password !== null && parsed.password !== "") ||
      (parsed.port !== undefined && parsed.port !== null && parsed.port !== "")
    ) {
      return null;
    }
    const match = THREADS_PATH.exec(parsed.pathname);
    if (!(match !== null)) {
      return null;
    }
    const username = Str.toLowerCase(match[1] ?? "");
    const shortcode = match[3];
    return {
      kind: shortcode !== undefined && shortcode !== null && shortcode !== "" ? "post" : "profile",
      url: `https://www.threads.com/@${username}${shortcode !== undefined && shortcode !== null && shortcode !== "" ? `/post/${shortcode}` : "/media"}`,
      username,
      shortcode,
      directorySegments:
        shortcode !== undefined && shortcode !== null && shortcode !== ""
          ? ["Threads", username, shortcode]
          : ["Threads", username],
    };
  } catch {
    return null;
  }
};
