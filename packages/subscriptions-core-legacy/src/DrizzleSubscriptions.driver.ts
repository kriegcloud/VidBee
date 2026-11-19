/**
 * SQLite-backed implementation of `SubscriptionsStore` and `MetaStore`,
 * built on top of `@vidbee/db`'s Drizzle tables.
 *
 * The package's runtime API is async even though `better-sqlite3` is sync,
 * to keep room for future remote stores (e.g. Postgres or a remote API
 * client). Hosts that already hold a `BetterSQLite3Database` plug it in
 * here; the public `SubscriptionsAPI` only sees the abstract interfaces.
 */
import { randomUUID } from 'node:crypto'
import { runtimeForHandle } from '@vidbee/db/legacy'
import { DbRowDecodeError } from '@vidbee/db'
import * as Effect from 'effect/Effect'
import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import * as Scheduler from 'effect/Scheduler'
import * as SqlClient from 'effect/sql/SqlClient'
import * as Schema from 'effect/Schema'
import * as Result from 'effect/Result'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import * as Rows from '@vidbee/subscriptions-core/Rows.model'
import { HostFailure } from '@vidbee/subscriptions-core/Subscriptions.errors'
import type Database from 'better-sqlite3'
import type { SubscriptionsStore, CreateSqliteStoresOptions, QueueLinkSelector } from './store.js'
import {
  type SubscriptionInsert,
  type SubscriptionItemInsert,
  subscriptionItemsTable,
  subscriptionsMetaTable,
  subscriptionsTable
} from '@vidbee/db/legacy/subscriptions'
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { buildFeedKey } from './feed-resolver.js'
import type { MetaStore } from './leader.js'
import type {
  LeaderKind,
  SubscriptionFeedItem,
  SubscriptionRule,
  SubscriptionWithItems
} from './types.js'


// Active markers exist only while an original synchronous Drizzle segment is on
// this JavaScript stack. Reentrant calls share that reservation and cannot
// retain it after their synchronous segment returns.
const activeSegments: Array<{ readonly handle: Database.Database }> = []
const failure = (original: unknown) => HostFailure.make({
  original,
  legacyMessage: original instanceof Error ? original.message : String(original)
})
const unwrap = (cause: Cause.Cause<unknown>): unknown => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause))
  if (error instanceof HostFailure) return error.original
  return error === undefined ? Cause.squash(cause) : error
}
export const runDrizzleSegment = <A>(db: BetterSQLite3Database, work: () => A): A => {
  const handle = (db as BetterSQLite3Database & { readonly $client: Database.Database }).$client
  const runtime = runtimeForHandle(handle)
  const run = Effect.try({
    try: () => {
      const marker = { handle }
      activeSegments.push(marker)
      try {
        return work()
      } finally {
        activeSegments.splice(activeSegments.indexOf(marker), 1)
      }
    },
    catch: failure,
  })
  const operation = activeSegments.some(entry => entry.handle === handle)
    ? run
    : Effect.scoped(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.reserve
        return yield* run
      }))
  return runLegacySync(runtime, operation.pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true)), unwrap)
}
const decode = <S extends Schema.ConstraintDecoder<unknown, never>>(
  table: 'subscriptions' | 'subscription_items' | 'subscriptions_meta',
  schema: S,
  value: unknown
): S['Type'] => {
  const result = Schema.decodeUnknownResult(schema)(value)
  if (Result.isFailure(result)) {
    throw DbRowDecodeError.make({ table, issue: 'Stored row does not match the table schema' })
  }
  return result.success
}
const rowToSubscription = (row: unknown): SubscriptionRule => Rows.rowToSubscription(decode('subscriptions', Rows.SubscriptionRawRow, row)) as SubscriptionRule
const rowToFeedItem = (row: unknown): SubscriptionFeedItem => Rows.rowToFeedItem(decode('subscription_items', Rows.SubscriptionItemRawRow, row))
const subscriptionToInsert = (rule: SubscriptionRule, now: number): SubscriptionInsert => Rows.subscriptionToInsert(rule, now) as SubscriptionInsert
const sanitizeList = Rows.sanitizeList
const LIST_PROFILE_ITEM_LIMIT = Rows.LIST_PROFILE_ITEM_LIMIT
export type SyncSubscriptionsDriver = { [K in Exclude<keyof SubscriptionsStore,'clearOrphanedQueueLinks'>]: SubscriptionsStore[K] extends (...args: infer A) => Promise<infer B> ? (...args:A)=>B : never } & {
  readQueueLinks: () => Array<typeof Rows.QueueLinkRow.Type>
  clearQueueLinkRows: (at:number, taskIds:readonly string[], items:NonNullable<QueueLinkSelector['items']>)=>number
}
export type SyncMetaDriver = { [K in keyof MetaStore]: MetaStore[K] extends (...args: infer A) => Promise<infer B> ? (...args:A)=>B : never }
const uniqueIds = Rows.sanitizeList

/**
 * Drop queue flags without deleting feed rows. `added = 0` is what lets a
 * user queue the item again; keeping the row is what blocks auto-download.
 */
const clearQueueLinkRows = (
  db: BetterSQLite3Database,
  at: number,
  taskIds: readonly string[],
  items: readonly { subscriptionId: string; itemId: string }[]
): number => {
  if (taskIds.length === 0 && items.length === 0) {
    return 0
  }
  const cleared = { added: 0, taskId: null, updatedAt: at }
  let changes = 0
  db.transaction((tx) => {
    if (taskIds.length > 0) {
      const result = tx
        .update(subscriptionItemsTable)
        .set(cleared)
        .where(inArray(subscriptionItemsTable.taskId, [...taskIds]))
        .run()
      changes += Number(result.changes ?? 0)
    }
    for (const item of items) {
      const result = tx
        .update(subscriptionItemsTable)
        .set(cleared)
        .where(
          and(
            eq(subscriptionItemsTable.subscriptionId, item.subscriptionId),
            eq(subscriptionItemsTable.itemId, item.itemId),
            or(eq(subscriptionItemsTable.added, 1), isNotNull(subscriptionItemsTable.taskId))
          )
        )
        .run()
      changes += Number(result.changes ?? 0)
    }
  })
  return changes
}

export const createDrizzleSubscriptionsDriver = ({
  db,
  now = () => Date.now(),
  generateId = () => randomUUID()
}: CreateSqliteStoresOptions): SyncSubscriptionsDriver => {
  const attachItems = (
    rules: SubscriptionRule[],
    profileItemLimit?: number
  ): SubscriptionWithItems[] => {
    if (rules.length === 0) {
      return []
    }
    const ids = rules.map((rule) => rule.id)
    const rows = db
      .select()
      .from(subscriptionItemsTable)
      .where(inArray(subscriptionItemsTable.subscriptionId, ids))
      .orderBy(desc(subscriptionItemsTable.publishedAt))
      .all()
    const grouped = new Map<string, SubscriptionFeedItem[]>()
    for (const row of rows) {
      const item = rowToFeedItem(row)
      const list = grouped.get(row.subscriptionId)
      if (list) {
        list.push(item)
      } else {
        grouped.set(row.subscriptionId, [item])
      }
    }
    return rules.map((rule) => {
      const items = grouped.get(rule.id) ?? []
      // Profile backlogs can reach thousands of rows; list() feeds a polled UI,
      // while get() keeps the full history for the download policy.
      return {
        ...rule,
        items:
          profileItemLimit !== undefined && rule.sourceKind === 'profile'
            ? items.slice(0, profileItemLimit)
            : items
      }
    })
  }

  return {
    list() {
      const rows = db
        .select()
        .from(subscriptionsTable)
        .orderBy(desc(subscriptionsTable.updatedAt))
        .all()
      return attachItems(rows.map(rowToSubscription), LIST_PROFILE_ITEM_LIMIT)
    },

    get(id) {
      const row = db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id)).get()
      if (!row) {
        return null
      }
      return attachItems([rowToSubscription(row)])[0] ?? null
    },

    findDuplicateFeed(feedUrl, ignoreId) {
      const target = buildFeedKey(feedUrl)
      if (!target) {
        return null
      }
      const rows = db
        .select({ id: subscriptionsTable.id, feedUrl: subscriptionsTable.feedUrl })
        .from(subscriptionsTable)
        .all().map(row=>decode('subscriptions',Rows.DuplicateFeedRow,row))
      const hit = rows.find((row) => row.id !== ignoreId && buildFeedKey(row.feedUrl) === target)
      return hit?.id ?? null
    },

    add(input) {
      const ts = now()
      const rule: SubscriptionRule = {
        id: generateId(),
        title: input.title?.trim() || input.sourceUrl,
        sourceUrl: input.sourceUrl,
        feedUrl: input.feedUrl,
        platform: input.platform,
        keywords: sanitizeList(input.keywords),
        tags: sanitizeList(input.tags),
        onlyDownloadLatest: input.onlyDownloadLatest ?? true,
        autoDownload: input.autoDownload ?? true,
        downloadType: input.downloadType,
        downloadQuality: input.downloadQuality,
        downloadContainer: input.downloadContainer,
        enabled: input.enabled ?? true,
        status: 'idle',
        createdAt: ts,
        updatedAt: ts,
        sourceKind: input.sourceKind ?? 'feed',
        categories: sanitizeList(input.categories)
      }
      if (input.profileOwner) {
        rule.profileOwner = input.profileOwner
      }
      if (input.checkIntervalMs !== undefined) {
        rule.checkIntervalMs = input.checkIntervalMs
      }
      if (input.downloadDirectory) {
        rule.downloadDirectory = input.downloadDirectory
      }
      if (input.namingTemplate) {
        rule.namingTemplate = input.namingTemplate
      }
      db.insert(subscriptionsTable).values(subscriptionToInsert(rule, ts)).run()
      return { ...rule, items: [] }
    },

    /** Update a subscription while preserving boolean settings omitted by callers. */
    update(id, patch) {
      const existingRow = db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.id, id))
        .get()
      if (!existingRow) {
        return null
      }
      const existing = rowToSubscription(existingRow)
      const next: SubscriptionRule = {
        ...existing,
        ...patch,
        onlyDownloadLatest: patch.onlyDownloadLatest ?? existing.onlyDownloadLatest,
        autoDownload: patch.autoDownload ?? existing.autoDownload,
        downloadType: patch.downloadType ?? existing.downloadType,
        downloadQuality: patch.downloadQuality ?? existing.downloadQuality,
        downloadContainer: patch.downloadContainer ?? existing.downloadContainer,
        enabled: patch.enabled ?? existing.enabled,
        keywords: patch.keywords ? sanitizeList(patch.keywords) : existing.keywords,
        tags: patch.tags ? sanitizeList(patch.tags) : existing.tags,
        categories: patch.categories ? sanitizeList(patch.categories) : existing.categories,
        updatedAt: now()
      }
      if (patch.sourceUrl && !patch.title && patch.sourceUrl !== existing.sourceUrl) {
        next.title = patch.sourceUrl
      }
      const payload = subscriptionToInsert(next, next.updatedAt)
      db.insert(subscriptionsTable)
        .values(payload)
        .onConflictDoUpdate({ target: subscriptionsTable.id, set: payload })
        .run()
      return attachItems([next])[0] ?? null
    },

    remove(id) {
      const result = db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, id)).run()
      if (Number(result.changes ?? 0) === 0) {
        return false
      }
      db.delete(subscriptionItemsTable).where(eq(subscriptionItemsTable.subscriptionId, id)).run()
      return true
    },

    replaceItems(subscriptionId, items) {
      const ts = now()
      db.transaction((tx) => {
        const existing = tx
          .select()
          .from(subscriptionItemsTable)
          .where(eq(subscriptionItemsTable.subscriptionId, subscriptionId))
          .all().map(row=>decode('subscription_items',Rows.SubscriptionItemRawRow,row))
        const previous = new Map(existing.map((row) => [row.itemId, row]))
        tx.delete(subscriptionItemsTable)
          .where(eq(subscriptionItemsTable.subscriptionId, subscriptionId))
          .run()
        for (const item of items) {
          const prev = previous.get(item.id)
          const insert: SubscriptionItemInsert = {
            subscriptionId,
            itemId: item.id,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            added: prev?.added ?? 0,
            createdAt: prev?.createdAt ?? item.publishedAt,
            updatedAt: ts
          }
          if (item.thumbnail) {
            insert.thumbnail = item.thumbnail
          }
          if (prev?.taskId) {
            insert.taskId = prev.taskId
          }
          tx.insert(subscriptionItemsTable).values(insert).run()
        }
      })
    },

    mergeItems(subscriptionId, items) {
      if (items.length === 0) {
        return
      }
      const ts = now()
      db.transaction((tx) => {
        const existing = new Set(
          tx
            .select({ itemId: subscriptionItemsTable.itemId })
            .from(subscriptionItemsTable)
            .where(eq(subscriptionItemsTable.subscriptionId, subscriptionId))
            .all()
            .map((row) => decode('subscription_items',Rows.ItemIdRow,row).itemId)
        )
        for (const item of items) {
          if (existing.has(item.id)) {
            tx.update(subscriptionItemsTable)
              .set({
                title: item.title,
                url: item.url,
                publishedAt: item.publishedAt,
                thumbnail: item.thumbnail ?? null,
                updatedAt: ts
              })
              .where(
                and(
                  eq(subscriptionItemsTable.subscriptionId, subscriptionId),
                  eq(subscriptionItemsTable.itemId, item.id)
                )
              )
              .run()
            continue
          }
          tx.insert(subscriptionItemsTable)
            .values({
              subscriptionId,
              itemId: item.id,
              title: item.title,
              url: item.url,
              publishedAt: item.publishedAt,
              thumbnail: item.thumbnail ?? null,
              added: 0,
              createdAt: ts,
              updatedAt: ts
            })
            .run()
        }
      })
    },

    markItemQueued(subscriptionId, itemId, taskId) {
      const ts = now()
      const set: Partial<SubscriptionItemInsert> = {
        added: taskId ? 1 : 0,
        taskId: taskId ?? null,
        updatedAt: ts
      }
      const result = db
        .update(subscriptionItemsTable)
        .set(set)
        .where(
          and(
            eq(subscriptionItemsTable.subscriptionId, subscriptionId),
            eq(subscriptionItemsTable.itemId, itemId)
          )
        )
        .run()
      if (Number(result.changes ?? 0) === 0) {
        // Row may not exist yet (e.g. user-initiated queue before feed parse);
        // do a best-effort upsert with placeholder fields.
        const insert: SubscriptionItemInsert = {
          subscriptionId,
          itemId,
          title: itemId,
          url: '',
          publishedAt: ts,
          added: taskId ? 1 : 0,
          taskId: taskId ?? null,
          createdAt: ts,
          updatedAt: ts
        }
        db.insert(subscriptionItemsTable)
          .values(insert)
          .onConflictDoUpdate({
            target: [subscriptionItemsTable.subscriptionId, subscriptionItemsTable.itemId],
            set
          })
          .run()
      }
    },

    clearQueueLinks(selector) {
      return clearQueueLinkRows(db, now(), uniqueIds(selector.taskIds), selector.items ?? [])
    },

    readQueueLinks() {
      return db.select({subscriptionId:subscriptionItemsTable.subscriptionId,itemId:subscriptionItemsTable.itemId,taskId:subscriptionItemsTable.taskId,added:subscriptionItemsTable.added}).from(subscriptionItemsTable).where(or(eq(subscriptionItemsTable.added,1),isNotNull(subscriptionItemsTable.taskId))).all().map(row=>decode('subscription_items',Rows.QueueLinkRow,row))
    },
    clearQueueLinkRows(at,taskIds,items) { return clearQueueLinkRows(db,at,taskIds,items) }
  }
}

const LEADER_KEYS = {
  kind: 'leader_kind',
  pid: 'leader_pid',
  startedAt: 'leader_started_at',
  heartbeatAt: 'leader_heartbeat_at',
  lockExpiresAt: 'leader_lock_expires_at',
  leaseId: 'leader_lease_id',
  preferred: 'preferred_leader'
} as const

const readMetaMap = (db: BetterSQLite3Database): Map<string, string> => {
  const rows = db.select().from(subscriptionsMetaTable).all().map(row=>decode('subscriptions_meta',Rows.SubscriptionsMetaRawRow,row))
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.key, row.value)
  }
  return map
}

const numOrNull = (raw: string | undefined): number | null => {
  if (raw === undefined) {
    return null
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const strOrNull = (raw: string | undefined): string | null => raw ?? null

const leaderKindOrNull = (raw: string | undefined): LeaderKind | null => {
  if (raw === 'desktop' || raw === 'api') {
    return raw
  }
  return null
}

export const createDrizzleMetaDriver = ({
  db,
  now = () => Date.now()
}: CreateSqliteStoresOptions): SyncMetaDriver => {
  const writeKey = (key: string, value: string | number | null, at: number): void => {
    if (value === null) {
      db.delete(subscriptionsMetaTable).where(eq(subscriptionsMetaTable.key, key)).run()
      return
    }
    db.insert(subscriptionsMetaTable)
      .values({ key, value: String(value), updatedAt: at })
      .onConflictDoUpdate({
        target: subscriptionsMetaTable.key,
        set: { value: String(value), updatedAt: at }
      })
      .run()
  }

  return {
    readLeader() {
      const map = readMetaMap(db)
      return {
        kind: leaderKindOrNull(map.get(LEADER_KEYS.kind)),
        pid: numOrNull(map.get(LEADER_KEYS.pid)),
        startedAt: numOrNull(map.get(LEADER_KEYS.startedAt)),
        heartbeatAt: numOrNull(map.get(LEADER_KEYS.heartbeatAt)),
        lockExpiresAt: numOrNull(map.get(LEADER_KEYS.lockExpiresAt)),
        leaseId: strOrNull(map.get(LEADER_KEYS.leaseId)),
        preferred: leaderKindOrNull(map.get(LEADER_KEYS.preferred))
      }
    },

    casLeader({ expectedLeaseId, now: ts, next }) {
      let success = false
      db.transaction((tx) => {
        const rows = tx.select().from(subscriptionsMetaTable).all().map(row=>decode('subscriptions_meta',Rows.SubscriptionsMetaRawRow,row))
        const map = new Map<string, string>(rows.map((row) => [row.key, row.value]))
        const currentLease = map.get(LEADER_KEYS.leaseId) ?? null
        const lockExpiresAt = numOrNull(map.get(LEADER_KEYS.lockExpiresAt))

        const okToWrite =
          expectedLeaseId === null
            ? currentLease === null || (lockExpiresAt !== null && lockExpiresAt <= ts)
            : currentLease === expectedLeaseId

        if (!okToWrite) {
          return
        }

        const writeKeyTx = (key: string, value: string | number | null): void => {
          if (value === null) {
            tx.delete(subscriptionsMetaTable).where(eq(subscriptionsMetaTable.key, key)).run()
            return
          }
          tx.insert(subscriptionsMetaTable)
            .values({ key, value: String(value), updatedAt: ts })
            .onConflictDoUpdate({
              target: subscriptionsMetaTable.key,
              set: { value: String(value), updatedAt: ts }
            })
            .run()
        }

        writeKeyTx(LEADER_KEYS.kind, next.kind)
        writeKeyTx(LEADER_KEYS.pid, next.pid)
        writeKeyTx(LEADER_KEYS.startedAt, next.startedAt)
        writeKeyTx(LEADER_KEYS.heartbeatAt, next.heartbeatAt)
        writeKeyTx(LEADER_KEYS.lockExpiresAt, next.lockExpiresAt)
        writeKeyTx(LEADER_KEYS.leaseId, next.leaseId)
        success = true
      })
      return success
    },

    readPreferred() {
      const map = readMetaMap(db)
      return leaderKindOrNull(map.get(LEADER_KEYS.preferred))
    },

    writePreferred(kind) {
      writeKey(LEADER_KEYS.preferred, kind, now())
    }
  }
}

