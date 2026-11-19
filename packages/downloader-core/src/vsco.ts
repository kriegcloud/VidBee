import { dual } from "effect/Function";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Str from "effect/String";
import type { VscoUrlKind } from "./DownloadLiterals.model.js";

const VSCO_HOSTS = MutableHashSet.fromIterable(["vsco.co", "www.vsco.co"]);
const VSCO_USER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VSCO_GALLERY_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)(?:\/(?:gallery|images))?\/?$/i;
const VSCO_MEDIA_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)\/media\/([0-9a-f]+)\/?$/i;
const VSCO_VIDEO_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)\/video\/([A-Za-z0-9-]+)\/?$/i;

/**
 * Site routes that look like a username. `/spaces/<id>` and `/<user>/spaces`
 * are separate gallery-dl extractors, so neither is a profile gallery here.
 */
const VSCO_RESERVED = MutableHashSet.fromIterable([
  "about",
  "discover",
  "feed",
  "login",
  "signup",
  "search",
  "spaces",
  "store",
  "user",
]);

export interface NormalizedVscoUrl {
  directorySegments: readonly string[];
  /** Post id, empty for a gallery. */
  id: string;
  /** `gallery` is the whole profile; `media` and `video` are single posts. */
  kind: typeof VscoUrlKind.Type;
  /** Canonical URL to hand gallery-dl. */
  url: string;
  username: string;
}

/** Normalize the VSCO profile and post routes gallery-dl can extract. */
export const normalizeVscoUrl = (value: string): NormalizedVscoUrl | null => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    !(["http:", "https:"].includes(parsed.protocol) && MutableHashSet.has(VSCO_HOSTS, Str.toLowerCase(parsed.hostname)))
  ) {
    return null;
  }
  const media = VSCO_MEDIA_PATH.exec(parsed.pathname);
  if (media !== null) {
    const [, username = "", id = ""] = media;
    return {
      kind: "media",
      username,
      url: `https://vsco.co/${username}/media/${Str.toLowerCase(id)}`,
      id: Str.toLowerCase(id),
      directorySegments: ["VSCO", username, "Gallery"],
    };
  }
  const video = VSCO_VIDEO_PATH.exec(parsed.pathname);
  if (video !== null) {
    const [, username = "", id = ""] = video;
    return {
      kind: "video",
      username,
      url: `https://vsco.co/${username}/video/${id}`,
      id,
      directorySegments: ["VSCO", username, "Gallery"],
    };
  }
  const gallery = VSCO_GALLERY_PATH.exec(parsed.pathname);
  const username = gallery?.[1];
  if (
    !(username !== undefined && username !== null && username !== "") ||
    MutableHashSet.has(VSCO_RESERVED, Str.toLowerCase(username))
  ) {
    return null;
  }
  return {
    kind: "gallery",
    username,
    url: `https://vsco.co/${username}/gallery`,
    id: "",
    directorySegments: ["VSCO", username, "Gallery"],
  };
};

/** A single VSCO post, which the profile mapper enumerates and queues one by one. */
const vscoPostUrlDataFirst = (username: string, id: string, video: boolean): string | null => {
  if (!(VSCO_USER.test(username) && (video ? /^[A-Za-z0-9-]+$/ : /^[0-9a-f]+$/i).test(id))) {
    return null;
  }
  return video ? `https://vsco.co/${username}/video/${id}` : `https://vsco.co/${username}/media/${Str.toLowerCase(id)}`;
};

export const vscoPostUrl: {
  (id: string, video: boolean): (username: string) => string | null;
  (username: string, id: string, video: boolean): string | null;
} = dual(3, vscoPostUrlDataFirst);

/** Plain implementations for internal data-first calls. */
export const DataFirst = {
  vscoPostUrl: vscoPostUrlDataFirst,
};
