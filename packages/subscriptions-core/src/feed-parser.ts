import { dual } from "effect/Function";
import * as MutableHashSet from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";

/** Discover only explicitly advertised RSS/Atom links, resolving relative URLs after redirects. */
const discover = (html: string, pageUrl: string): string[] => {
  const seen = MutableHashSet.empty<string>();
  const urls: string[] = [];
  for (const tag of O.getOrUndefined(Str.match(/<link\b[^>]*>/gi)(html)) ?? []) {
    const attributes: Record<string, string> = {};
    for (const match of Str.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)(tag)) {
      const key = match[1];
      if (key !== undefined && Boolean(key)) {
        attributes[Str.toLowerCase(key)] = match[2] ?? match[3] ?? match[4] ?? "";
      }
    }
    const href = attributes.href;
    if (
      !(
        (attributes.rel === undefined
          ? false
          : Str.split(Str.toLowerCase(attributes.rel), /\s+/).includes("alternate")) &&
        ["application/rss+xml", "application/atom+xml"].includes(
          attributes.type === undefined ? "" : Str.toLowerCase(attributes.type)
        ) &&
        href !== undefined &&
        Boolean(href)
      )
    ) {
      continue;
    }
    try {
      const url = new URL(Str.replace(/&amp;/gi, "&")(href), pageUrl);
      if (["http:", "https:"].includes(url.protocol) && !Boolean(url.username) && !Boolean(url.password)) {
        if (!MutableHashSet.has(seen, url.href)) {
          MutableHashSet.add(seen, url.href);
          urls.push(url.href);
        }
      }
    } catch {
      // Invalid advertised links are not candidates.
    }
    if (urls.length === 3) {
      break;
    }
  }
  return urls;
};

export const discoverFeedUrls: {
  (html: string, pageUrl: string): string[];
  (pageUrl: string): (html: string) => string[];
} = dual(2, discover);
export { SubscriptionFeedLive } from "./SubscriptionFeed.layer.js";
export { SubscriptionFeed } from "./SubscriptionFeed.service.js";
export type { FeedProbe, InterpretableFeed } from "./Feed.model.js";
