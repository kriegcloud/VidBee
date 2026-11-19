import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as Str from "effect/String";

const onlyFansChatPath = (value: string): URL | null => {
  try {
    const parsed = new URL(value);
    const parts = A.filter(Str.split(parsed.pathname, "/"), Boolean);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "onlyfans.com" || parsed.hostname === "www.onlyfans.com") &&
      parts[0] === "my" &&
      parts[1] === "chats" &&
      parts[2] === "chat" &&
      /^\d+$/.test(parts[3] ?? "")
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

/**
 * Chat captures keep the conversation URL, including `firstId`.
 * Other pages still drop media suffixes so the player can open them.
 */
const capturePageUrlDataFirst = (value: string, videoOrdinal?: number): string => {
  if (videoOrdinal !== undefined && P.isTruthy(videoOrdinal) && videoOrdinal > 0) {
    const chat = onlyFansChatPath(value);
    if (chat !== null) {
      chat.hash = "";
      return chat.toString();
    }
  }
  return playbackPageUrl(value);
};

/** Strip site-specific media suffixes so the player opens the watchable page. */
export const playbackPageUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    const mediaMatch = Option.getOrNull(Str.match(/\/media\/(\d+)\/?$/)(parsed.pathname));
    parsed.pathname = Str.replace(/\/media\/\d+\/?$/, "")(parsed.pathname);
    parsed.search = "";
    if (mediaMatch !== null && mediaMatch[1] !== undefined && P.isTruthy(mediaMatch[1])) {
      parsed.searchParams.set("media", mediaMatch[1]);
    }
    if (/\/my\/chats\/chat\/\d+$/i.test(parsed.pathname)) {
      parsed.pathname = `${Str.replace(/\/$/, "")(parsed.pathname)}/gallery`;
    }
    return parsed.toString();
  } catch {
    return value;
  }
};
const DRM_PATTERNS = ["drm protected", "known to use drm protection"] as const;
export const DRM_FALLBACK_MESSAGE =
  "[VidBeep] Source is DRM protected; recording in-browser playback on a virtual display.";

/** True when a yt-dlp finish event is the expected CDM/DRM failure. */
export const isDrmProtectedMessage = (text: string): boolean => {
  const normalized = Str.toLowerCase(text);
  return A.some(DRM_PATTERNS, (pattern) => Str.includes(pattern)(normalized));
};
export const capturePageUrl: {
  (videoOrdinal: number | undefined): (value: string) => string;
  (value: string, videoOrdinal?: number): string;
} = dual((args) => args.length >= 2 || typeof args[0] === "string", capturePageUrlDataFirst);
