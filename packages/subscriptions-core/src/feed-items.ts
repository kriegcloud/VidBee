import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashSet from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
/**
 * Helpers for working with parsed RSS items: normalization, dedupe, and
 * thumbnail/cover extraction. All functions are pure — feeding the same
 * `ParsedFeedItem[]` always returns the same `NormalizedFeedItem[]`.
 */
import type { NormalizedFeedItem, ParsedFeed, ParsedFeedItem, SubscriptionFeedItem } from "./types.js";

interface SubscriptionFeedSource {
  id: string;
  items?: SubscriptionFeedItem[];
}

export interface SubscriptionFeedEntry<TSubscription extends SubscriptionFeedSource> {
  item: NonNullable<TSubscription["items"]>[number];
  subscription: TSubscription;
}

/** Merge subscription items into one newest-first timeline while retaining their source. */
export const getSubscriptionFeedEntries = <TSubscription extends SubscriptionFeedSource>(
  subscriptions: TSubscription[]
): SubscriptionFeedEntry<TSubscription>[] => {
  const entries: SubscriptionFeedEntry<TSubscription>[] = [];
  for (const subscription of subscriptions) {
    for (const item of subscription.items ?? []) {
      entries.push({ subscription, item });
    }
  }
  return A.sort(entries, (left: SubscriptionFeedEntry<TSubscription>, right: SubscriptionFeedEntry<TSubscription>) => {
    const difference = right.item.publishedAt - left.item.publishedAt;
    return difference < 0 ? -1 : difference > 0 ? 1 : 0;
  });
};

const resolveItemId = (item: ParsedFeedItem): string | null => {
  const candidate = item.youtubeId || item.guid || item.id || (typeof item.link === "string" ? item.link : null);
  if (candidate === null || !Boolean(candidate)) {
    return null;
  }
  // rss-parser custom fields can contain nested XML objects. This reviewed
  // external-data failure is retained at the original preferred-ID call site.
  if (typeof candidate !== "string") throw new TypeError("candidate.trim is not a function");
  return Str.trim(candidate);
};

const resolvePublishedAt = (item: ParsedFeedItem, options: NormalizeOptions): number => {
  for (const candidate of [item.isoDate, item.pubDate]) {
    if (!Boolean(candidate)) {
      continue;
    }
    const ts = options.parseDate(candidate);
    if (ts !== null) {
      return ts;
    }
  }
  return options.now();
};

const extractImageFromHtml = (html?: string): string | undefined => {
  if (html === undefined || !Boolean(html)) {
    return undefined;
  }

  const srcMatch = O.getOrNull(
    Str.match(/<img\b[^>]*\b(?:src|data-src|data-original)\b\s*=\s*(['"]?)([^'">\s]+)\1/i)(html)
  );
  if (srcMatch?.[2] !== undefined && Boolean(srcMatch[2])) {
    return srcMatch[2];
  }

  const srcsetMatch = O.getOrNull(Str.match(/<img[^>]+srcset\s*=\s*(['"])([^'"]+)\1/i)(html));
  if (srcsetMatch?.[2] !== undefined && Boolean(srcsetMatch[2])) {
    const firstCandidate = Str.split(Str.trim(Str.split(srcsetMatch[2], ",")[0]), /\s+/)[0];
    if (Boolean(firstCandidate)) {
      return firstCandidate;
    }
  }

  return undefined;
};

/**
 * Read an iTunes-style image URL from a string or `{ href }` / `{ url }` object.
 *
 * Ximalaya and most podcast feeds use `<itunes:image href="..."/>` with no RSS
 * 2.0 `<image>` / `<media:thumbnail>`, so this is the primary cover source.
 *
 * @param image rss-parser `itunes.image` value
 */
const extractItunesImageUrl = (image: unknown): string | undefined => {
  if (typeof image === "string") {
    const trimmed = Str.trim(image);
    return Boolean(trimmed) ? trimmed : undefined;
  }
  if (!Boolean(image) || typeof image !== "object") {
    return undefined;
  }
  const record = image;
  if (P.hasProperty(record, "href") && typeof record.href === "string" && Boolean(Str.trim(record.href))) {
    return Str.trim(record.href);
  }
  if (P.hasProperty(record, "url") && typeof record.url === "string" && Boolean(Str.trim(record.url))) {
    return Str.trim(record.url);
  }
  return undefined;
};

/**
 * Pick the best thumbnail for one feed item: iTunes episode artwork first,
 * then media/enclosure images, then an `<img>` extracted from HTML content.
 *
 * @param item Parsed rss-parser item
 */
export const resolveThumbnail = (item: ParsedFeedItem): string | undefined => {
  const itunesImageUrl = extractItunesImageUrl(item.itunes?.image);
  if (Boolean(itunesImageUrl)) {
    return itunesImageUrl;
  }

  const thumbnail = item.mediaThumbnail;
  if (A.isArray(thumbnail)) {
    const found = O.getOrUndefined(A.findFirst(thumbnail, (entry) => Boolean(entry?.url)));
    if (found?.url !== undefined && Boolean(found.url)) {
      return found.url;
    }
  }
  if (
    Boolean(thumbnail) &&
    thumbnail !== undefined &&
    thumbnail !== null &&
    typeof thumbnail === "object" &&
    "url" in thumbnail
  ) {
    return (thumbnail as { url?: string }).url;
  }

  const enclosure = item.enclosure;
  if (A.isArray(enclosure)) {
    const imageEnclosure = O.getOrUndefined(
      A.findFirst(
        enclosure,
        (entry) =>
          Boolean(entry?.url) &&
          (entry?.type === undefined || entry.type === null ? false : Str.startsWith("image/")(entry.type))
      )
    );
    if (imageEnclosure?.url !== undefined && Boolean(imageEnclosure.url)) {
      return imageEnclosure.url;
    }
  }
  if (
    Boolean(enclosure) &&
    enclosure !== undefined &&
    enclosure !== null &&
    typeof enclosure === "object" &&
    "url" in enclosure
  ) {
    const enc = enclosure as { url?: string; type?: string };
    if (Boolean(enc.url) && enc.type !== undefined && enc.type !== null && Str.startsWith("image/")(enc.type)) {
      return enc.url;
    }
  }

  const mediaContent = item.mediaContent;
  if (A.isArray(mediaContent)) {
    const found = O.getOrUndefined(A.findFirst(mediaContent, (entry) => Boolean(entry?.url)));
    if (found?.url !== undefined && Boolean(found.url)) {
      return found.url;
    }
  }
  if (
    Boolean(mediaContent) &&
    mediaContent !== undefined &&
    mediaContent !== null &&
    typeof mediaContent === "object" &&
    "url" in mediaContent
  ) {
    return (mediaContent as { url?: string }).url;
  }

  for (const html of [item.content, item.contentEncoded, item.description, item.summary, item.contentSnippet]) {
    const imageUrl = extractImageFromHtml(html);
    if (Boolean(imageUrl)) {
      return imageUrl;
    }
  }

  return undefined;
};

/**
 * Pick the best cover URL for a feed: explicit feed image first, then
 * iTunes-style image, then the first thumbnail we can extract from any item.
 */
const feedCover = (
  feed: Pick<ParsedFeed, "image" | "itunes">,
  items: NormalizedFeedItem[],
  rawItems: ParsedFeedItem[]
): string | undefined => {
  const feedImageUrl = typeof feed.image?.url === "string" ? feed.image.url : undefined;
  if (Boolean(feedImageUrl)) {
    return feedImageUrl;
  }

  const itunesImageUrl = extractItunesImageUrl(feed.itunes?.image);
  if (Boolean(itunesImageUrl)) {
    return itunesImageUrl;
  }

  const itemThumb = O.getOrUndefined(A.findFirst(items, (item) => Boolean(item.thumbnail)))?.thumbnail;
  if (Boolean(itemThumb)) {
    return itemThumb;
  }

  for (const item of rawItems) {
    const thumb = resolveThumbnail(item);
    if (Boolean(thumb)) {
      return thumb;
    }
  }

  return undefined;
};

export interface NormalizeOptions {
  readonly now: () => number;
  readonly parseDate: (value: unknown) => number | null;
}

/**
 * Convert a list of parsed RSS items into the canonical normalized shape.
 * Items missing id / link / title are dropped silently. Output is sorted by
 * publishedAt descending so callers can take the head as "latest".
 */
const normalizeItems = (items: ParsedFeedItem[], options: NormalizeOptions): NormalizedFeedItem[] => {
  const out: NormalizedFeedItem[] = [];
  for (const item of items) {
    const id = resolveItemId(item);
    if (
      !(Boolean(id) && Boolean(item.link) && Boolean(item.title)) ||
      id === null ||
      item.link === undefined ||
      item.title === undefined
    ) {
      continue;
    }
    out.push({
      id,
      url: item.link,
      title: item.title,
      publishedAt: resolvePublishedAt(item, options),
      thumbnail: resolveThumbnail(item),
    });
  }
  return A.sort(out, (a: NormalizedFeedItem, b: NormalizedFeedItem) => {
    const difference = b.publishedAt - a.publishedAt;
    return difference < 0 ? -1 : difference > 0 ? 1 : 0;
  });
};

/**
 * Drop items whose stable id has already been seen earlier in the list,
 * preserving order. Used after `normalizeFeedItems` for upserts and again
 * before queue insertion to guarantee one-task-per-(subscription, itemId).
 */
export const dedupeFeedItems = <T extends { id: string }>(items: T[]): T[] => {
  const seen = MutableHashSet.empty<string>();
  const out: T[] = [];
  for (const item of items) {
    if (MutableHashSet.has(seen, item.id)) {
      continue;
    }
    MutableHashSet.add(seen, item.id);
    out.push(item);
  }
  return out;
};

export const normalizeFeedItems: {
  (items: ParsedFeedItem[], options: NormalizeOptions): NormalizedFeedItem[];
  (options: NormalizeOptions): (items: ParsedFeedItem[]) => NormalizedFeedItem[];
} = dual(2, normalizeItems);
export const resolveFeedCover: {
  (
    feed: Pick<ParsedFeed, "image" | "itunes">,
    items: NormalizedFeedItem[],
    rawItems: ParsedFeedItem[]
  ): string | undefined;
  (
    items: NormalizedFeedItem[],
    rawItems: ParsedFeedItem[]
  ): (feed: Pick<ParsedFeed, "image" | "itunes">) => string | undefined;
} = dual(3, feedCover);

// The parser intentionally retains custom-field objects and wrong-kind scalar
// fields. These interpretations follow the old traversal before row binding.
const readField = (value: unknown, key: string): unknown => {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading '${key}')`);
  }
  if ((typeof value === "object" || typeof value === "function") && P.hasProperty(value, key)) return value[key];
  return undefined;
};
export const readRawFeedField: {
  (value: unknown, key: string): unknown;
  (key: string): (value: unknown) => unknown;
} = dual(2, readField);
export const interpretItemId = (item: unknown): string | null => {
  const youtubeId = readField(item, "youtubeId");
  const guid = Boolean(youtubeId) ? undefined : readField(item, "guid");
  const ownId = Boolean(youtubeId) || Boolean(guid) ? undefined : readField(item, "id");
  const link = Boolean(youtubeId) || Boolean(guid) || Boolean(ownId) ? undefined : readField(item, "link");
  const candidate = Boolean(youtubeId)
    ? youtubeId
    : Boolean(guid)
      ? guid
      : Boolean(ownId)
        ? ownId
        : typeof link === "string"
          ? link
          : null;
  if (!Boolean(candidate)) return null;
  if (typeof candidate !== "string") throw new TypeError("candidate.trim is not a function");
  return Str.trim(candidate);
};
const optionalField = (value: unknown, key: string): unknown =>
  value === null || value === undefined ? undefined : readField(value, key);
const imageText = (image: unknown): string | undefined => {
  if (typeof image === "string") {
    const trimmed = Str.trim(image);
    return Boolean(trimmed) ? trimmed : undefined;
  }
  if (!Boolean(image) || typeof image !== "object") return undefined;
  const href = readField(image, "href");
  if (typeof href === "string" && Boolean(Str.trim(href))) return Str.trim(href);
  const url = readField(image, "url");
  return typeof url === "string" && Boolean(Str.trim(url)) ? Str.trim(url) : undefined;
};
const imageType = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value !== "string") throw new TypeError("entry?.type?.startsWith is not a function");
  return Str.startsWith("image/")(value);
};
const rawHtmlImage = (html: unknown): string | undefined => {
  if (!Boolean(html)) return undefined;
  if (typeof html !== "string") throw new TypeError("html.match is not a function");
  return extractImageFromHtml(html);
};
export const interpretThumbnail = (item: unknown): unknown => {
  const itunes = imageText(optionalField(readField(item, "itunes"), "image"));
  if (Boolean(itunes)) return itunes;
  const thumbnail = readField(item, "mediaThumbnail");
  if (A.isArray(thumbnail)) {
    for (const entry of thumbnail) {
      const url = optionalField(entry, "url");
      if (Boolean(url)) return url;
    }
  }
  if (thumbnail !== null && typeof thumbnail === "object" && P.hasProperty(thumbnail, "url")) return thumbnail.url;
  const enclosure = readField(item, "enclosure");
  if (A.isArray(enclosure)) {
    for (const entry of enclosure) {
      const url = optionalField(entry, "url");
      if (Boolean(url) && imageType(optionalField(entry, "type"))) return url;
    }
  }
  if (enclosure !== null && typeof enclosure === "object" && P.hasProperty(enclosure, "url")) {
    const url = enclosure.url;
    if (Boolean(url) && imageType(readField(enclosure, "type"))) return url;
  }
  const media = readField(item, "mediaContent");
  if (A.isArray(media)) {
    for (const entry of media) {
      const url = optionalField(entry, "url");
      if (Boolean(url)) return url;
    }
  }
  if (media !== null && typeof media === "object" && P.hasProperty(media, "url")) return media.url;
  for (const key of ["content", "contentEncoded", "description", "summary", "contentSnippet"]) {
    const url = rawHtmlImage(readField(item, key));
    if (Boolean(url)) return url;
  }
  return undefined;
};
const interpretedCover = (
  feed: unknown,
  items: readonly { thumbnail?: unknown }[],
  rawItems: readonly unknown[]
): unknown => {
  const image = optionalField(readField(feed, "image"), "url");
  if (typeof image === "string" && Boolean(image)) return image;
  const itunes = imageText(optionalField(readField(feed, "itunes"), "image"));
  if (Boolean(itunes)) return itunes;
  for (const item of items) if (Boolean(item.thumbnail)) return item.thumbnail;
  for (const item of rawItems) {
    const thumbnail = interpretThumbnail(item);
    if (Boolean(thumbnail)) return thumbnail;
  }
  return undefined;
};
export const interpretFeedCover: {
  (feed: unknown, items: readonly { thumbnail?: unknown }[], rawItems: readonly unknown[]): unknown;
  (items: readonly { thumbnail?: unknown }[], rawItems: readonly unknown[]): (feed: unknown) => unknown;
} = dual(3, interpretedCover);
