import { DbRowDecodeError } from "@vidbee/db";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Rec from "effect/Record";
import * as S from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Str from "effect/String";
import * as SqlClient from "effect/sql/SqlClient";
import * as F from "./Feed.model.js";
import { buildFeedKey } from "./feed-resolver.js";
import * as R from "./Rows.model.js";
import { decodeRow } from "./Rows.model.js";
import { SubscriptionEntropy } from "./SubscriptionEntropy.service.js";
import { SubscriptionStore } from "./SubscriptionStore.service.js";
import { HostFailure } from "./Subscriptions.errors.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import type * as M from "./Subscription.model.js";
import type { StoreEffect } from "./SubscriptionStore.service.js";

const names: Readonly<Record<string, string>> = {
  sourceUrl: "source_url",
  feedUrl: "feed_url",
  onlyDownloadLatest: "only_latest",
  autoDownload: "auto_download",
  coverUrl: "cover_url",
  latestVideoTitle: "latest_video_title",
  latestVideoPublishedAt: "latest_video_published_at",
  lastCheckedAt: "last_checked_at",
  lastSuccessAt: "last_success_at",
  lastError: "last_error",
  createdAt: "created_at",
  updatedAt: "updated_at",
  downloadDirectory: "download_directory",
  namingTemplate: "naming_template",
  downloadType: "download_type",
  downloadQuality: "download_quality",
  downloadContainer: "download_container",
  sourceKind: "source_kind",
  profileOwner: "profile_owner",
  checkIntervalMs: "check_interval_ms",
  nextCheckAt: "next_check_at",
  subscriptionId: "subscription_id",
  itemId: "item_id",
  publishedAt: "published_at",
  taskId: "task_id",
};
const column = (key: string): string => names[key] ?? key;
export const SubscriptionStoreSqlLive = Layer.effect(
  SubscriptionStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const mutex = yield* Semaphore.make(1);
    // Depth -1 reserves the connection without opening a transaction; the first
    // withTransaction inside the segment still emits BEGIN (depth 0).
    const reserved = Effect.fnUntraced(function* <A, E, R>(work: Effect.Effect<A, E, R>) {
      const active = yield* Effect.serviceOption(sql.transactionService);
      if (Option.isSome(active)) return yield* work;
      const connection = yield* sql.reserve;
      return yield* work.pipe(Effect.provideService(sql.transactionService, [connection, -1]));
    });
    const segment = <A, E, R>(work: Effect.Effect<A, E, R>) => work.pipe(reserved, Effect.scoped, mutex.withPermits(1));
    const timers = yield* SubscriptionTimers;
    const entropy = yield* SubscriptionEntropy;
    const insert = Effect.fn("SubscriptionStore.insert")(function* (
      table: string,
      payload: Record<string, unknown>,
      conflict?: readonly string[]
    ) {
      const entries = pipe(
        Rec.toEntries(payload),
        Arr.filter(([, value]) => value !== undefined)
      );
      const columns = Arr.map(entries, ([key]) => column(key));
      const suffix =
        conflict === undefined
          ? ""
          : ` ON CONFLICT (${pipe(Arr.map(conflict, column), Arr.join(","))}) DO UPDATE SET ${pipe(
              Arr.map(columns, (key) => `${key}=excluded.${key}`),
              Arr.join(",")
            )}`;
      yield* sql.unsafe(
        `INSERT INTO ${table} (${Arr.join(columns, ",")}) VALUES (${pipe(
          Arr.map(entries, () => "?"),
          Arr.join(",")
        )})${suffix}`,
        Arr.map(entries, ([, value]) => value)
      );
    });
    const changes = Effect.fn("SubscriptionStore.changes")(function* () {
      const rows = yield* sql`SELECT changes() AS changes`;
      const row = yield* decodeRow("subscription_items")(R.ChangesRow)(rows[0]);
      return row.changes;
    });
    const attach = Effect.fn("SubscriptionStore.attach")(function* <Rule extends { id: unknown; sourceKind: unknown }>(
      rules: Rule[],
      limit?: number
    ) {
      if (rules.length === 0) return [];
      const rows =
        yield* sql`SELECT * FROM subscription_items WHERE subscription_id IN ${sql.in(Arr.map(rules, (rule) => rule.id ?? null))} ORDER BY published_at DESC`;
      let grouped = HashMap.empty<string, M.SubscriptionFeedItem[]>();
      for (const value of rows) {
        const row = yield* decodeRow("subscription_items")(R.SubscriptionItemRawRowFromSql)(value);
        const list = Option.getOrElse(HashMap.get(grouped, row.subscriptionId), (): M.SubscriptionFeedItem[] => []);
        list.push(R.rowToFeedItem(row));
        grouped = HashMap.set(grouped, row.subscriptionId, list);
      }
      return Arr.map(rules, (rule) => {
        const items = Option.getOrElse(
          typeof rule.id === "string" ? HashMap.get(grouped, rule.id) : Option.none(),
          () => []
        );
        return { ...rule, items: limit !== undefined && rule.sourceKind === "profile" ? items.slice(0, limit) : items };
      });
    });
    const get = Effect.fn("SubscriptionStore.get")(function* (id: string) {
      const rows = yield* sql`SELECT * FROM subscriptions WHERE id=${id}`;
      if (rows.length === 0) return null;
      const decoded = yield* decodeRow("subscriptions")(R.SubscriptionRawRowFromSql)(rows[0]);
      const rule = R.rowToSubscription(decoded);
      return (yield* attach([rule]))[0] ?? null;
    });
    const clear = Effect.fn("SubscriptionStore.clear")(function* (
      at: number,
      taskIds: readonly string[],
      items: NonNullable<M.QueueLinkSelector["items"]>
    ) {
      if (taskIds.length === 0 && items.length === 0) return 0;
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            let count = 0;
            if (taskIds.length > 0) {
              yield* sql`UPDATE subscription_items SET added=0,task_id=NULL,updated_at=${at} WHERE task_id IN ${sql.in(taskIds)}`;
              count += yield* changes();
            }
            for (const item of items) {
              yield* sql`UPDATE subscription_items SET added=0,task_id=NULL,updated_at=${at} WHERE subscription_id=${item.subscriptionId} AND item_id=${item.itemId} AND (added=1 OR task_id IS NOT NULL)`;
              count += yield* changes();
            }
            return count;
          })
        )
        .pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN"));
    });
    const store = SubscriptionStore.of({
      list: Effect.gen(function* () {
        const values = yield* sql`SELECT * FROM subscriptions ORDER BY updated_at DESC`;
        const rules: F.StoredSubscriptionRule[] = [];
        for (const value of values) {
          const decoded = yield* decodeRow("subscriptions")(R.SubscriptionRawRowFromSql)(value);
          rules.push(R.rowToSubscription(decoded));
        }
        return yield* attach(rules, R.LIST_PROFILE_ITEM_LIMIT);
      }),
      get,
      findDuplicateFeed: Effect.fn(function* (url, ignoreId) {
        const target = buildFeedKey(url);
        const hasTarget = Boolean(target);
        if (!hasTarget) return null;
        const rows = yield* sql`SELECT id,feed_url FROM subscriptions`;
        for (const value of rows) {
          const row = yield* decodeRow("subscriptions")(R.DuplicateFeedRowFromSql)(value);
          if (row.id !== ignoreId && buildFeedKey(row.feedUrl) === target) return row.id;
        }
        return null;
      }),
      add: Effect.fn(function* (input) {
        const at = yield* timers.now;
        const id = yield* entropy.subscriptionId;
        const rule: F.StoredSubscriptionRule = {
          id,
          title:
            (input.title === undefined || input.title === null ? undefined : Str.trim(input.title)) || input.sourceUrl,
          sourceUrl: input.sourceUrl,
          feedUrl: input.feedUrl,
          platform: input.platform,
          keywords: R.sanitizeList(input.keywords),
          tags: R.sanitizeList(input.tags),
          onlyDownloadLatest: input.onlyDownloadLatest ?? true,
          autoDownload: input.autoDownload ?? true,
          downloadType: input.downloadType,
          downloadQuality: input.downloadQuality,
          downloadContainer: input.downloadContainer,
          enabled: input.enabled ?? true,
          status: "idle",
          createdAt: at,
          updatedAt: at,
          sourceKind: input.sourceKind ?? "feed",
          categories: R.sanitizeList(input.categories),
        };
        const hasprofileOwner = Boolean(input.profileOwner);
        if (hasprofileOwner && input.profileOwner !== undefined) rule.profileOwner = input.profileOwner;
        if (input.checkIntervalMs !== undefined) rule.checkIntervalMs = input.checkIntervalMs;
        const hasdownloadDirectory = Boolean(input.downloadDirectory);
        if (hasdownloadDirectory && input.downloadDirectory !== undefined)
          rule.downloadDirectory = input.downloadDirectory;
        const hasnamingTemplate = Boolean(input.namingTemplate);
        if (hasnamingTemplate && input.namingTemplate !== undefined) rule.namingTemplate = input.namingTemplate;
        yield* insert("subscriptions", R.subscriptionToInsert(rule, at));
        return { ...rule, items: [] };
      }),
      update: Effect.fn(function* (id, patch) {
        const raw = yield* sql`SELECT * FROM subscriptions WHERE id=${id}`;
        if (raw.length === 0) return null;
        const decoded = yield* decodeRow("subscriptions")(R.SubscriptionRawRowFromSql)(raw[0]);
        const existing = R.rowToSubscription(decoded);
        const at = yield* timers.now;
        const hasKeywords = Boolean(patch.keywords);
        const hasTags = Boolean(patch.tags);
        const hasCategories = Boolean(patch.categories);
        const next = {
          ...existing,
          ...patch,
          onlyDownloadLatest: patch.onlyDownloadLatest ?? existing.onlyDownloadLatest,
          autoDownload: patch.autoDownload ?? existing.autoDownload,
          downloadType: patch.downloadType ?? existing.downloadType,
          downloadQuality: patch.downloadQuality ?? existing.downloadQuality,
          downloadContainer: patch.downloadContainer ?? existing.downloadContainer,
          enabled: patch.enabled ?? existing.enabled,
          keywords: hasKeywords ? R.sanitizeList(patch.keywords) : existing.keywords,
          tags: hasTags ? R.sanitizeList(patch.tags) : existing.tags,
          categories: hasCategories ? R.sanitizeList(patch.categories) : existing.categories,
          updatedAt: at,
        };
        const hasSourceUrl = Boolean(patch.sourceUrl);
        const hasTitle = Boolean(patch.title);
        if (hasSourceUrl && patch.sourceUrl !== undefined && !hasTitle && patch.sourceUrl !== existing.sourceUrl)
          next.title = patch.sourceUrl;
        const payload = R.subscriptionToInsert(next, at);
        const returned = { ...next, items: [] };
        if (!S.is(F.SubscriptionMutationResult)(returned))
          return yield* DbRowDecodeError.make({ table: "subscriptions", issue: "Invalid constructed mutation" });
        yield* insert("subscriptions", payload, ["id"]);
        return (yield* attach([returned]))[0] ?? null;
      }),
      remove: Effect.fn(function* (id) {
        yield* sql`DELETE FROM subscriptions WHERE id=${id}`;
        if ((yield* changes()) === 0) return false;
        yield* sql`DELETE FROM subscription_items WHERE subscription_id=${id}`;
        return true;
      }),
      replaceItems: Effect.fn(function* (subscriptionId, items) {
        const at = yield* timers.now;
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const raw = yield* sql`SELECT * FROM subscription_items WHERE subscription_id=${subscriptionId}`;
              let previous = HashMap.empty<string, typeof R.SubscriptionItemRawRow.Type>();
              for (const value of raw) {
                const row = yield* decodeRow("subscription_items")(R.SubscriptionItemRawRowFromSql)(value);
                previous = HashMap.set(previous, row.itemId, row);
              }
              yield* sql`DELETE FROM subscription_items WHERE subscription_id=${subscriptionId}`;
              for (const item of items) {
                const prev = Option.getOrUndefined(
                  typeof item.id === "string" ? HashMap.get(previous, item.id) : Option.none()
                );
                const hasThumbnail = Boolean(item.thumbnail);
                const hasTaskId = Boolean(prev?.taskId);
                yield* insert("subscription_items", {
                  subscriptionId,
                  itemId: item.id,
                  title: item.title,
                  url: item.url,
                  publishedAt: item.publishedAt,
                  added: prev?.added ?? 0,
                  createdAt: prev?.createdAt ?? item.publishedAt,
                  updatedAt: at,
                  ...(hasThumbnail ? { thumbnail: item.thumbnail } : {}),
                  ...(hasTaskId && prev !== undefined ? { taskId: prev.taskId } : {}),
                });
              }
            })
          )
          .pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN"));
      }),
      mergeItems: Effect.fn(function* (subscriptionId, items) {
        if (items.length === 0) return;
        const at = yield* timers.now;
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const raw = yield* sql`SELECT item_id FROM subscription_items WHERE subscription_id=${subscriptionId}`;
              let existing = HashSet.empty<string>();
              for (const value of raw) {
                existing = HashSet.add(
                  existing,
                  (yield* decodeRow("subscription_items")(R.ItemIdRowFromSql)(value)).itemId
                );
              }
              for (const item of items) {
                if (HashSet.has(existing, item.id)) {
                  yield* sql.unsafe(
                    "UPDATE subscription_items SET title=?,url=?,published_at=?,thumbnail=?,updated_at=? WHERE subscription_id=? AND item_id=?",
                    [item.title, item.url, item.publishedAt, item.thumbnail ?? null, at, subscriptionId, item.id]
                  );
                } else {
                  yield* insert("subscription_items", {
                    subscriptionId,
                    itemId: item.id,
                    title: item.title,
                    url: item.url,
                    publishedAt: item.publishedAt,
                    thumbnail: item.thumbnail ?? null,
                    added: 0,
                    createdAt: at,
                    updatedAt: at,
                  });
                }
              }
            })
          )
          .pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN"));
      }),
      markItemQueued: Effect.fn(function* (subscriptionId, itemId, taskId) {
        const at = yield* timers.now;
        const hasTaskId = Boolean(taskId);
        const added = hasTaskId ? 1 : 0;
        yield* sql`UPDATE subscription_items SET added=${added},task_id=${taskId ?? null},updated_at=${at} WHERE subscription_id=${subscriptionId} AND item_id=${itemId}`;
        if ((yield* changes()) === 0) {
          yield* sql`INSERT INTO subscription_items (subscription_id,item_id,title,url,published_at,added,task_id,created_at,updated_at) VALUES (${subscriptionId},${itemId},${itemId},'',${at},${added},${taskId ?? null},${at},${at}) ON CONFLICT(subscription_id,item_id) DO UPDATE SET added=excluded.added,task_id=excluded.task_id,updated_at=excluded.updated_at`;
        }
      }),
      clearQueueLinks: Effect.fn(function* (selector) {
        const at = yield* timers.now;
        return yield* clear(at, R.sanitizeList(selector.taskIds), selector.items ?? []);
      }),
      clearOrphanedQueueLinks: Effect.fn(function* (isLive: (taskId: string) => StoreEffect<boolean>) {
        const raw = yield* segment(
          sql`SELECT subscription_id,item_id,task_id,added FROM subscription_items WHERE added=1 OR task_id IS NOT NULL`
        );
        const tasks: string[] = [];
        const items: { subscriptionId: string; itemId: string }[] = [];
        let seen = HashSet.empty<string>();
        let liveById = HashMap.empty<string, boolean>();
        for (const value of raw) {
          const row = yield* decodeRow("subscription_items")(R.QueueLinkRowFromSql)(value);
          const hasTaskId = Boolean(row.taskId);
          if (hasTaskId && row.taskId !== null) {
            let live = Option.getOrUndefined(HashMap.get(liveById, row.taskId));
            if (live === undefined) {
              live = yield* isLive(row.taskId);
              liveById = HashMap.set(liveById, row.taskId, live);
            }
            if (live || HashSet.has(seen, row.taskId)) continue;
            seen = HashSet.add(seen, row.taskId);
            tasks.push(row.taskId);
          } else if (row.added === 1) {
            items.push({ subscriptionId: row.subscriptionId, itemId: row.itemId });
          }
        }
        const at = yield* timers.now;
        return yield* segment(clear(at, tasks, items));
      }),
    });
    return SubscriptionStore.of({
      ...store,
      list: segment(store.list),
      get: Effect.fn("SubscriptionStore.get")((id) => segment(store.get(id))),
      findDuplicateFeed: Effect.fn("SubscriptionStore.findDuplicateFeed")((url, ignoreId) =>
        segment(store.findDuplicateFeed(url, ignoreId))
      ),
      add: Effect.fn("SubscriptionStore.add")((input) => segment(store.add(input))),
      update: Effect.fn("SubscriptionStore.update")((id, patch) =>
        segment(store.update(id, patch)).pipe(
          Effect.catchDefect((original) =>
            Effect.fail(
              HostFailure.make({
                original,
                legacyMessage: original instanceof Error ? original.message : String(original),
              })
            )
          )
        )
      ),
      remove: Effect.fn("SubscriptionStore.remove")((id) => segment(store.remove(id))),
      replaceItems: Effect.fn("SubscriptionStore.replaceItems")((id, items) => segment(store.replaceItems(id, items))),
      mergeItems: Effect.fn("SubscriptionStore.mergeItems")((id, items) => segment(store.mergeItems(id, items))),
      markItemQueued: Effect.fn("SubscriptionStore.markItemQueued")((id, item, task) =>
        segment(store.markItemQueued(id, item, task))
      ),
      clearQueueLinks: Effect.fn("SubscriptionStore.clearQueueLinks")((selector) =>
        segment(store.clearQueueLinks(selector))
      ),
    });
  })
);
