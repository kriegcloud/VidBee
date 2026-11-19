import { fanslyProfile, isFanslySite } from "@vidbee/downloader-core/fansly-profile";
import * as A from "effect/Array";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import { browserProfilesLayer } from "./BrowserProfiles.layer.js";
import type { OnlyFansItem } from "@vidbee/downloader-core/onlyfans-profile";
import type { BrowserProfileAdapter } from "./onlyfans-profile.js";

const object = (value: unknown): Record<string, unknown> => (P.isObject(value) ? value : {});
const array = (value: unknown): Record<string, unknown>[] => (A.isArray(value) ? A.map(value, object) : []);
const id = (value: unknown): string | null => (typeof value === "string" && /^\d+$/.test(value) ? value : null);
const api = (url: URL): boolean =>
  url.origin === "https://apiv3.fansly.com" && Str.startsWith("/api/v1/")(url.pathname);

/** Only first-party media locations are accepted; account credentials never go to the CDN. */
export function fanslyMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      /^(?:[a-z0-9-]+\.)*fansly\.com$/.test(url.hostname) &&
      /^(?:cdn|media|video|image)[a-z0-9-]*\./.test(url.hostname) &&
      !P.isTruthy(url.username) &&
      !P.isTruthy(url.password) &&
      !P.isTruthy(url.port)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Preserve attachment identity and never substitute a locked item's preview. */
export function fanslyItems(payload: unknown): {
  item: OnlyFansItem;
  mediaUrl: string | null;
}[] {
  const body = object(object(payload).response);
  const aggregate = object(body.aggregationData);
  const posts = [...array(body.posts), ...array(aggregate.posts)];
  const media = [...array(body.accountMedia), ...array(aggregate.accountMedia)];
  const bundles = [...array(body.accountMediaBundles), ...array(aggregate.accountMediaBundles)];
  const postIds = MutableHashMap.empty<string, string>();
  const associate = (offerId: string, postId: string, bundleId: unknown = offerId): void => {
    MutableHashMap.set(postIds, offerId, postId);
    const bundle = Option.getOrUndefined(A.findFirst(bundles, (entry) => entry.id === bundleId));
    for (const raw of A.isArray(bundle?.accountMediaIds) ? bundle.accountMediaIds : []) {
      const mediaId = id(raw);
      if (mediaId !== null && P.isTruthy(mediaId)) {
        MutableHashMap.set(postIds, mediaId, postId);
      }
    }
    for (const entry of array(bundle?.bundleContent ?? bundle?.content)) {
      const mediaId = id(entry.accountMediaId);
      if (mediaId !== null && P.isTruthy(mediaId)) {
        MutableHashMap.set(postIds, mediaId, postId);
      }
    }
  };
  for (const post of posts) {
    const postId = id(post.id);
    if (postId === null || !P.isTruthy(postId)) {
      continue;
    }
    for (const attachment of array(post.attachments)) {
      const contentId = id(attachment.contentId);
      if (contentId !== null && P.isTruthy(contentId)) {
        associate(contentId, postId);
      }
    }
  }
  // locationId identifies a timeline; correlationId identifies the actual post.
  for (const location of array(body.data)) {
    const postId = id(location.correlationId);
    const offerId = id(location.mediaOfferId);
    if (postId !== null && offerId !== null && P.isTruthy(postId) && P.isTruthy(offerId)) {
      associate(offerId, postId, location.mediaOfferBundleId);
    }
  }
  const result: {
    item: OnlyFansItem;
    mediaUrl: string | null;
  }[] = [];
  for (const entry of media) {
    const mediaId = id(entry.id);
    const postId = P.isTruthy(mediaId) ? Option.getOrUndefined(MutableHashMap.get(postIds, mediaId)) : null;
    const original = object(entry.media);
    const mimetype = String(original.mimetype ?? "");
    const category = Str.startsWith("image/")(mimetype) ? "photos" : /video|mpegurl/.test(mimetype) ? "videos" : null;
    if (
      mediaId === null ||
      postId === null ||
      postId === undefined ||
      category === null ||
      !P.isTruthy(mediaId) ||
      !P.isTruthy(postId) ||
      !P.isTruthy(category)
    ) {
      continue;
    }
    const variants = [
      original,
      ...array(original.variants).sort((a, b) => Number(b.height || 0) - Number(a.height || 0)),
    ];
    const mediaUrl =
      Option.getOrUndefined(
        A.findFirst(
          A.flatMap(
            A.filter(
              variants,
              (variant) =>
                !P.isTruthy(variant.nsfwBlock) &&
                (category === "photos"
                  ? Str.startsWith("image/")(String(variant.mimetype))
                  : Str.startsWith("video/")(String(variant.mimetype)))
            ),
            (variant: Record<string, unknown>) =>
              A.map(array(variant.locations), (location) => fanslyMediaUrl(location.location))
          ),
          (url) => url !== null && P.isTruthy(url) && /\.(?:jpe?g|png|webp|gif|mp4|mov|m4v)(?:\?|$)/i.test(url)
        )
      ) ?? null;
    result.push({
      item: {
        id: mediaId,
        postId,
        category,
        state:
          entry.access === false
            ? "locked"
            : P.isTruthy(mediaUrl)
              ? "available"
              : entry.access === true
                ? "unsupported"
                : "locked",
        downloaded: false,
      },
      mediaUrl: entry.access === false ? null : mediaUrl,
    });
  }
  return result;
}
export const fanslyAdapter: BrowserProfileAdapter = {
  name: "Fansly",
  key: "fansly",
  origin: "https://fansly.com",
  normalize: fanslyProfile,
  isSite: isFanslySite,
  items: fanslyItems,
  ownerResponse: (url, username) =>
    api(url) &&
    url.pathname === "/api/v1/account" &&
    A.contains(Str.split(Str.toLowerCase(url.searchParams.get("usernames") ?? ""), ","), username),
  ownerId: (payload, username) =>
    id(
      Option.getOrUndefined(
        A.findFirst(
          array(object(payload).response),
          (account) => Str.toLowerCase(String(account.username)) === username
        )
      )?.id
    ),
  feedResponse: (url, ownerId) =>
    api(url) &&
    (url.pathname === `/api/v1/timeline/${ownerId}` ||
      url.pathname === `/api/v1/timelinenew/${ownerId}` ||
      (url.pathname === "/api/v1/mediaoffers/location" && url.searchParams.get("accountId") === ownerId)),
  complete: (payload) => {
    const body = object(object(payload).response);
    return (
      body.hasMore === false ||
      (A.isArray(body.posts) && body.posts.length === 0) ||
      (A.isArray(body.data) && body.data.length === 0)
    );
  },
  queueUrl: (_item, profile) => `${profile.profileUrl}/posts`,
  refreshUrl: (item) => `https://fansly.com/post/${item.postId}`,
  refreshResponse: (url, item) =>
    api(url) &&
    url.pathname === "/api/v1/post" &&
    A.contains(Str.split(url.searchParams.get("ids") ?? "", ","), item.postId),
  scrollMode: () => ({
    nested: true,
    chat: false,
  }),
  requiresCookies: false,
};

export const fanslyProfilesLayer = (storageDir: string) => browserProfilesLayer({ storageDir, adapter: fanslyAdapter });
