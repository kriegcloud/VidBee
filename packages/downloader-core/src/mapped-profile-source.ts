import { dual } from "effect/Function";
import * as Str from "effect/String";
import { normalizeFacebookGalleryUrl } from "./facebook-gallery.js";
import { normalizePinterestUrl } from "./pinterest.js";
import { normalizeSnapchatUrl, DataFirst as SnapchatFunctions } from "./snapchat.js";
import { resolveSocialSource } from "./social-media.js";
import { normalizeThreadsUrl } from "./threads.js";
import { normalizeVscoUrl } from "./vsco.js";

export type MappedProfilePlatform =
  | "x"
  | "tiktok"
  | "redgifs"
  | "facebook"
  | "vsco"
  | "threads"
  | "pinterest"
  | "snapchat";

export interface MappedProfileSource {
  categories: { key: string; url: string; requiresAuth: boolean }[];
  category: string;
  owner: string;
  platform: MappedProfilePlatform;
  profileUrl: string;
}

/** Site name shown wherever a mapped profile is named to the user. */
export const MAPPED_PROFILE_SITE_LABELS: Record<MappedProfilePlatform, string> = {
  x: "X",
  tiktok: "TikTok",
  redgifs: "Redgifs",
  facebook: "Facebook",
  vsco: "VSCO",
  threads: "Threads",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

/**
 * Platforms whose mapper reads cookies from a dedicated VidBee browser session.
 * Every other platform uses the browser cookies configured in Settings. The
 * desktop session manager and the mapper dialog both read this list, so the
 * dialog can never offer a login window the main process would refuse.
 */
export const DEDICATED_SESSION_PLATFORMS = ["x", "tiktok"] as const satisfies readonly MappedProfilePlatform[];

export type DedicatedSessionPlatform = (typeof DEDICATED_SESSION_PLATFORMS)[number];

/** True when this platform signs in through its own dedicated browser session. */
export const isDedicatedSessionPlatform = (platform: string | null | undefined): platform is DedicatedSessionPlatform =>
  (DEDICATED_SESSION_PLATFORMS as readonly string[]).includes(platform ?? "");

const REDGIFS_USER = /^[A-Za-z0-9._-]{1,64}$/;
const REDGIFS_POST = /^[A-Za-z0-9-]{2,100}$/;

export const redGifsWatchUrl = (id: string): string | null =>
  REDGIFS_POST.test(id) ? `https://www.redgifs.com/watch/${Str.toLowerCase(id)}` : null;

const isMappedProfilePostUrlDataFirst = (platform: MappedProfilePlatform, value: string): boolean => {
  if (platform === "snapchat") {
    const snap = normalizeSnapchatUrl(value);
    return (snap?.kind === "story-snap" || snap?.kind === "spotlight") && snap.url === value;
  }
  if (platform === "pinterest") {
    const pin = normalizePinterestUrl(value);
    return pin?.kind === "pin" && pin.url === value;
  }
  if (platform === "vsco") {
    const vsco = normalizeVscoUrl(value);
    return (vsco?.kind === "media" || vsco?.kind === "video") && vsco.url === value;
  }
  if (platform === "threads") {
    const threads = normalizeThreadsUrl(value);
    return threads?.kind === "post" && threads.url === value;
  }
  if (platform === "facebook") {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" &&
        parsed.hostname === "www.facebook.com" &&
        !(parsed.username !== undefined && parsed.username !== null && parsed.username !== "") &&
        !(parsed.password !== undefined && parsed.password !== null && parsed.password !== "") &&
        !(parsed.port !== undefined && parsed.port !== null && parsed.port !== "") &&
        !(parsed.hash !== undefined && parsed.hash !== null && parsed.hash !== "") &&
        ((/^\/reel\/\d+\/?$/.test(parsed.pathname) &&
          !(parsed.search !== undefined && parsed.search !== null && parsed.search !== "")) ||
          (parsed.pathname === "/photo/" &&
            parsed.searchParams.size === 1 &&
            /^\d+$/.test(parsed.searchParams.get("fbid") ?? "")))
      );
    } catch {
      return false;
    }
  }
  if (platform !== "redgifs") {
    const source = resolveSocialSource(value);
    return source?.platform === platform && source.kind === "post";
  }
  try {
    const url = new URL(value);
    const match = /^\/watch\/([^/]+)\/?$/.exec(url.pathname);
    return Boolean(
      url.protocol === "https:" &&
        (url.hostname === "redgifs.com" || url.hostname === "www.redgifs.com") &&
        !(url.username !== undefined && url.username !== null && url.username !== "") &&
        !(url.password !== undefined && url.password !== null && url.password !== "") &&
        !(url.port !== undefined && url.port !== null && url.port !== "") &&
        !(url.search !== undefined && url.search !== null && url.search !== "") &&
        !(url.hash !== undefined && url.hash !== null && url.hash !== "") &&
        match?.[1] &&
        redGifsWatchUrl(match[1]) === `https://www.redgifs.com/watch/${match[1]}`
    );
  } catch {
    return false;
  }
};

export const isMappedProfilePostUrl: {
  (value: string): (platform: MappedProfilePlatform) => boolean;
  (platform: MappedProfilePlatform, value: string): boolean;
} = dual(2, isMappedProfilePostUrlDataFirst);

export const resolveMappedProfileSource = (value: string): MappedProfileSource | null => {
  const pinterest = normalizePinterestUrl(value);
  if (pinterest?.kind === "profile") {
    return {
      platform: "pinterest",
      owner: pinterest.username,
      profileUrl: pinterest.url,
      category: "posts",
      categories: [{ key: "posts", url: pinterest.url, requiresAuth: false }],
    };
  }
  const vsco = normalizeVscoUrl(value);
  if (vsco?.kind === "gallery") {
    return {
      platform: "vsco",
      owner: vsco.username,
      profileUrl: vsco.url,
      category: "gallery",
      categories: [{ key: "gallery", url: vsco.url, requiresAuth: false }],
    };
  }
  const snapchat = normalizeSnapchatUrl(value);
  if (snapchat !== null && ["profile", "stories", "spotlights"].includes(snapchat.kind)) {
    return {
      platform: "snapchat",
      owner: snapchat.username,
      profileUrl: `https://www.snapchat.com/@${snapchat.username}`,
      category: snapchat.kind === "spotlights" ? "spotlight" : "stories",
      categories: [
        {
          key: "stories",
          url: SnapchatFunctions.snapchatCategoryUrl(snapchat.username, "stories"),
          requiresAuth: false,
        },
        {
          key: "spotlight",
          url: SnapchatFunctions.snapchatCategoryUrl(snapchat.username, "spotlight"),
          requiresAuth: false,
        },
      ],
    };
  }
  const threads = normalizeThreadsUrl(value);
  if (threads?.kind === "profile") {
    return {
      platform: "threads",
      owner: threads.username,
      profileUrl: threads.url,
      category: "media",
      categories: [{ key: "media", url: threads.url, requiresAuth: true }],
    };
  }
  try {
    const parsed = new URL(value);
    const host = Str.toLowerCase(parsed.hostname);
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      ["facebook.com", "www.facebook.com", "m.facebook.com", "mbasic.facebook.com", "web.facebook.com"].includes(
        host
      ) &&
      !(parsed.username !== undefined && parsed.username !== null && parsed.username !== "") &&
      !(parsed.password !== undefined && parsed.password !== null && parsed.password !== "") &&
      !(parsed.port !== undefined && parsed.port !== null && parsed.port !== "")
    ) {
      const gallery = normalizeFacebookGalleryUrl(value);
      const reels = /^\/([A-Za-z0-9][A-Za-z0-9.]*)\/reels\/?$/.exec(parsed.pathname);
      const reelOwner =
        reels !== null && normalizeFacebookGalleryUrl(`https://www.facebook.com/${reels[1]}`) !== null
          ? reels[1]
          : null;
      const owner = gallery?.directorySegments.length === 3 ? gallery.directorySegments[1] : reelOwner;
      if (owner !== undefined && owner !== null && owner !== "") {
        const profileUrl = `https://www.facebook.com/${owner}`;
        return {
          platform: "facebook",
          owner,
          profileUrl,
          category:
            reelOwner !== undefined && reelOwner !== null && reelOwner !== ""
              ? "reels"
              : (gallery?.url === undefined || gallery?.url === null
                    ? undefined
                    : Str.endsWith("/photos_albums")(gallery?.url)) === true
                ? "albums"
                : "photos",
          categories: [
            { key: "photos", url: `${profileUrl}/photos`, requiresAuth: true },
            { key: "albums", url: `${profileUrl}/photos_albums`, requiresAuth: true },
            { key: "reels", url: `${profileUrl}/reels`, requiresAuth: true },
          ],
        };
      }
    }
  } catch {
    return null;
  }
  const social = resolveSocialSource(value);
  if (
    social?.categories.length !== undefined &&
    social?.categories.length !== 0 &&
    (social.platform === "x" || social.platform === "tiktok")
  ) {
    return {
      platform: social.platform,
      owner: social.owner,
      profileUrl: social.platform === "x" ? `https://x.com/${social.owner}` : `https://www.tiktok.com/@${social.owner}`,
      category: social.category,
      categories: social.categories,
    };
  }
  try {
    const url = new URL(value);
    if (
      !(
        ["http:", "https:"].includes(url.protocol) &&
        ["redgifs.com", "www.redgifs.com"].includes(Str.toLowerCase(url.hostname))
      ) ||
      (url.username !== undefined && url.username !== null && url.username !== "") ||
      (url.password !== undefined && url.password !== null && url.password !== "") ||
      (url.port !== undefined && url.port !== null && url.port !== "")
    ) {
      return null;
    }
    const match = /^\/users\/([^/]+)\/?$/.exec(url.pathname);
    const owner = match?.[1];
    if (owner === undefined || owner === "" || !REDGIFS_USER.test(owner)) {
      return null;
    }
    const profileUrl = `https://www.redgifs.com/users/${owner}`;
    return {
      platform: "redgifs",
      owner,
      profileUrl,
      category: "posts",
      categories: [{ key: "posts", url: profileUrl, requiresAuth: false }],
    };
  } catch {
    return null;
  }
};

/** Plain implementations for internal data-first calls. */
export const DataFirst = {
  isMappedProfilePostUrl: isMappedProfilePostUrlDataFirst,
};
