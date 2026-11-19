import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";
import {
  dedupeFeedItems,
  interpretFeedCover,
  interpretItemId,
  interpretThumbnail,
  readRawFeedField,
} from "./feed-items.js";
import { SubscriptionDates } from "./SubscriptionDates.service.js";
import { SubscriptionPolicy, SubscriptionPolicyHistory } from "./SubscriptionPolicy.service.js";
import { SubscriptionQueue } from "./SubscriptionQueue.service.js";
import { FeedTraversalFailure } from "./Subscriptions.errors.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import { isProfilePlatform, profileItemCategory, profileItemId } from "./types.js";
import type { InterpretedFeedItem, StoredAutoDownloadDecision } from "./Feed.model.js";
import type { NormalizedFeedItem, ProfileDownloadDecision } from "./Subscription.model.js";

const traversal = <A>(read: () => A) =>
  Effect.try({
    try: read,
    catch: (original) =>
      FeedTraversalFailure.make({
        original,
        legacyMessage: original instanceof Error ? original.message : String(original),
      }),
  });
const newest = <T extends { publishedAt: number }>(left: T, right: T): -1 | 0 | 1 => {
  const difference = right.publishedAt - left.publishedAt;
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
};
export const layer = Layer.effect(
  SubscriptionPolicy,
  Effect.gen(function* () {
    const dates = yield* SubscriptionDates;
    const timers = yield* SubscriptionTimers;
    const queue = yield* SubscriptionQueue;
    const historyOption = yield* Effect.serviceOption(SubscriptionPolicyHistory);
    const history = O.getOrUndefined(historyOption)?.contains ?? queue.historyContains;
    return SubscriptionPolicy.of({
      rss: Effect.fnUntraced(function* ({ subscription, knownItems, feed }) {
        const rawItems = A.isArray(feed.items) ? feed.items : [];
        const normalized: Array<InterpretedFeedItem & { id: string }> = [];
        for (const raw of rawItems) {
          const id = yield* traversal(() => interpretItemId(raw));
          if (id === null || !Boolean(id)) continue;
          const url = yield* traversal(() => readRawFeedField(raw, "link"));
          if (!Boolean(url)) continue;
          const title = yield* traversal(() => readRawFeedField(raw, "title"));
          if (!Boolean(title)) continue;
          let publishedAt: number | undefined;
          for (const key of ["isoDate", "pubDate"]) {
            const value = yield* traversal(() => readRawFeedField(raw, key));
            if (!Boolean(value)) continue;
            const parsed = yield* dates.parse(value);
            if (parsed !== null) {
              publishedAt = parsed;
              break;
            }
          }
          if (publishedAt === undefined) publishedAt = yield* timers.now;
          const thumbnail = yield* traversal(() => interpretThumbnail(raw));
          normalized.push({ id, url, title, publishedAt, thumbnail });
        }
        const ordered = A.sort(normalized, newest<InterpretedFeedItem & { id: string }>);
        const fromItems = A.reduce(knownItems, 0, (max, item) => Math.max(max, item.publishedAt));
        const cutoff = Math.max(subscription.latestVideoPublishedAt ?? 0, fromItems);
        const recent =
          cutoff === 0
            ? subscription.onlyDownloadLatest
              ? A.take(ordered, 1)
              : ordered
            : A.filter(ordered, (item) => item.publishedAt > cutoff);
        const seen = MutableHashSet.fromIterable(A.map(knownItems, (item) => item.id));
        const filtered = yield* traversal(() =>
          A.filter(recent, (item) => {
            if (MutableHashSet.has(seen, item.id)) return false;
            if (subscription.keywords.length === 0) return true;
            if (typeof item.title !== "string") throw new TypeError("item.title.toLowerCase is not a function");
            const lowered = Str.toLowerCase(item.title);
            return A.some(subscription.keywords, (word) => Str.includes(Str.toLowerCase(word))(lowered));
          })
        );
        const admitted: typeof normalized = [];
        for (const item of dedupeFeedItems(filtered)) if (!(yield* history(item.url))) admitted.push(item);
        const deduped = A.sort(admitted, newest<InterpretedFeedItem & { id: string }>);
        const queued = subscription.onlyDownloadLatest && deduped[0] !== undefined ? [deduped[0]] : deduped;
        const latest = ordered[0];
        const coverUrl = yield* traversal(() => interpretFeedCover(feed, ordered, rawItems));
        const decision: StoredAutoDownloadDecision = {
          subscription,
          items: subscription.autoDownload ? queued : [],
          feedItemsToPersist: ordered,
          latestPublishedAt: latest?.publishedAt ?? null,
        };
        if (latest !== undefined && Boolean(latest.title)) decision.latestVideoTitle = latest.title;
        if (Boolean(coverUrl)) decision.coverUrl = coverUrl;
        return decision;
      }),
      profile: Effect.fnUntraced(function* ({ subscription, knownItems, result }) {
        const followed =
          subscription.categories === undefined || subscription.categories === null
            ? MutableHashSet.empty<string>()
            : MutableHashSet.fromIterable(subscription.categories);
        const discoveredAt = yield* timers.now;
        const knownById = MutableHashMap.fromIterable(A.map(knownItems, (item) => [item.id, item] as const));
        const knownCategories = MutableHashMap.empty<string, MutableHashSet.MutableHashSet<string | undefined>>();
        const categoryOf = (id: string) =>
          isProfilePlatform(subscription.platform) ? profileItemCategory(subscription.platform, id) : undefined;
        for (const item of knownItems) {
          const categories = O.getOrElse(MutableHashMap.get(knownCategories, item.url), () =>
            MutableHashSet.empty<string | undefined>()
          );
          MutableHashSet.add(categories, categoryOf(item.id));
          MutableHashMap.set(knownCategories, item.url, categories);
        }
        const versioned = MutableHashSet.empty<string>();
        const normalized = yield* traversal(() =>
          A.sort(
            dedupeFeedItems(
              A.map(
                A.filter(
                  result.items,
                  (item) => MutableHashSet.has(followed, item.category) && Boolean(item.id) && Boolean(item.url)
                ),
                (item) => {
                  const id = profileItemId(item.category, item.id);
                  if (Boolean(item.versioned)) MutableHashSet.add(versioned, id);
                  const fallback = `@${subscription.profileOwner ?? subscription.title} · ${item.category} · ${item.id}`;
                  const title = item.title === undefined || item.title === null ? undefined : Str.trim(item.title);
                  const entry: NormalizedFeedItem = {
                    id,
                    url: item.url,
                    title: title === undefined || !Boolean(title) ? fallback : title,
                    publishedAt:
                      item.publishedAt ??
                      O.getOrUndefined(MutableHashMap.get(knownById, id))?.publishedAt ??
                      discoveredAt,
                  };
                  if (Boolean(item.thumbnail)) entry.thumbnail = item.thumbnail;
                  return entry;
                }
              )
            ),
            newest<NormalizedFeedItem>
          )
        );
        const queuedUrls = MutableHashSet.empty<string>();
        const items: NormalizedFeedItem[] = [];
        for (const item of normalized) {
          if (MutableHashMap.has(knownById, item.id) || MutableHashSet.has(queuedUrls, item.url)) continue;
          const isNew = MutableHashSet.has(versioned, item.id);
          const seenUnder = O.getOrUndefined(MutableHashMap.get(knownCategories, item.url));
          const category = categoryOf(item.id);
          if (seenUnder !== undefined && !(isNew && A.every(A.fromIterable(seenUnder), (entry) => entry === category)))
            continue;
          if (!isNew && (yield* history(item.url))) continue;
          MutableHashSet.add(queuedUrls, item.url);
          items.push(item);
        }
        const decision: ProfileDownloadDecision = {
          items: subscription.autoDownload ? items : [],
          itemsToPersist: normalized,
        };
        if (normalized[0] !== undefined) decision.latest = normalized[0];
        return decision;
      }),
    });
  })
);
