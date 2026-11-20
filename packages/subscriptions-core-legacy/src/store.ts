import { rethrowQueryError } from '@vidbee/db/legacy'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { SubscriptionMeta } from '@vidbee/subscriptions-core/SubscriptionMeta.service'
import { SubscriptionMetaMemoryLive } from '@vidbee/subscriptions-core/SubscriptionMeta.layer'
import { createDrizzleSubscriptionsDriver, createDrizzleMetaDriver, runDrizzleSegment } from './DrizzleSubscriptions.driver.js'
import { legacyError } from './Host.driver.js'
import type { MetaStore } from './leader.js'
import type {
  LeaderKind,
  LeaderState,
  NormalizedFeedItem,
  SubscriptionCreateInput,
  SubscriptionRule,
  SubscriptionUpdateInput,
  SubscriptionWithItems
} from './types.js' 
export { LIST_PROFILE_ITEM_LIMIT } from '@vidbee/subscriptions-core/Rows.model'
// Unwrap the Drizzle 1.0 boundary for every supplied-store caller, including meta operations.
const withDriverErrors = <T extends object>(store: T): T => {
  for (const key of Reflect.ownKeys(store)) {
    const descriptor = Object.getOwnPropertyDescriptor(store, key)
    const value = descriptor?.value
    if (typeof value !== 'function') continue
    const wrapped = {
      invoke(this: unknown, ...args: unknown[]) {
        try {
          const result = Reflect.apply(value, this, args)
          return result instanceof Promise
            ? result.catch((error: unknown) => rethrowQueryError(error))
            : result
        } catch (error) {
          return rethrowQueryError(error)
        }
      }
    }.invoke
    Object.defineProperty(wrapped, 'name', { value: value.name, configurable: true })
    Object.defineProperty(wrapped, 'length', { value: value.length, configurable: true })
    Object.setPrototypeOf(wrapped, Object.getPrototypeOf(value))
    Object.defineProperty(store, key, { ...descriptor, value: wrapped })
  }
  return store
}

export interface SubscriptionsStore {
  list(): Promise<SubscriptionWithItems[]>
  get(id: string): Promise<SubscriptionWithItems | null>
  /** Returns the matched id when `feedUrl` collides, ignoring `ignoreId`. */
  findDuplicateFeed(feedUrl: string, ignoreId?: string): Promise<string | null>
  add(input: SubscriptionCreateInput): Promise<SubscriptionWithItems>
  update(
    id: string,
    patch: SubscriptionUpdateInput & Partial<SubscriptionRule>
  ): Promise<SubscriptionWithItems | null>
  remove(id: string): Promise<boolean>
  /** Replace the entire `subscription_items` snapshot for one subscription. */
  replaceItems(subscriptionId: string, items: NormalizedFeedItem[]): Promise<void>
  /**
   * Upsert items without dropping rows that are missing from `items`. Profile
   * subscriptions use this: a failed category or an expired story must stay
   * in the seen-history so the next check does not queue it again.
   */
  mergeItems(subscriptionId: string, items: NormalizedFeedItem[]): Promise<void>
  /**
   * Mark an item as `added` and link the spawned task id. Idempotent — if
   * the row already records the same taskId nothing changes.
   */
  markItemQueued(subscriptionId: string, itemId: string, taskId: string | null): Promise<void>
  /**
   * Clear the queue flag and task id for the selected rows. The item rows
   * stay so the feed still treats them as already seen.
   */
  clearQueueLinks(selector: QueueLinkSelector): Promise<number>
  /**
   * Clear queue links whose task id is missing or rejected by `isLive`.
   * Returns how many rows changed.
   */
  clearOrphanedQueueLinks(isLive: (taskId: string) => boolean | Promise<boolean>): Promise<number>
}

export interface QueueLinkSelector {
  taskIds?: readonly string[]
  items?: readonly { subscriptionId: string; itemId: string }[]
}

export interface CreateSqliteStoresOptions {
  db: BetterSQLite3Database
  /** Defaults to `Date.now`. */
  now?: () => number
  /** Defaults to `crypto.randomUUID`. */
  generateId?: () => string
}


export const createSqliteSubscriptionsStore = ({
  db,
  now = () => Date.now(),
  generateId
}: CreateSqliteStoresOptions): SubscriptionsStore => {
  const driver = createDrizzleSubscriptionsDriver({ db, now, generateId })
  const segment = <A>(work: () => A): A => runDrizzleSegment(db, work)
  return withDriverErrors<SubscriptionsStore>({
    async list() { return segment(() => driver.list()) },
    async get(id) { return segment(() => driver.get(id)) },
    async findDuplicateFeed(feedUrl, ignoreId) {
      return segment(() => driver.findDuplicateFeed(feedUrl, ignoreId))
    },
    async add(input) { return segment(() => driver.add(input)) },
    async update(id, patch) { return segment(() => driver.update(id, patch)) },
    async remove(id) { return segment(() => driver.remove(id)) },
    async replaceItems(subscriptionId, items) {
      return segment(() => driver.replaceItems(subscriptionId, items))
    },
    async mergeItems(subscriptionId, items) {
      return segment(() => driver.mergeItems(subscriptionId, items))
    },
    async markItemQueued(subscriptionId, itemId, taskId) {
      return segment(() => driver.markItemQueued(subscriptionId, itemId, taskId))
    },
    async clearQueueLinks(selector) { return segment(() => driver.clearQueueLinks(selector)) },
    async clearOrphanedQueueLinks(isLive) {
      const rows = segment(() => driver.readQueueLinks())
      const taskIds: string[] = []
      const items: { subscriptionId: string; itemId: string }[] = []
      const seenTasks = new Set<string>()
      const liveByTaskId = new Map<string, boolean>()
      for (const row of rows) {
        if (row.taskId) {
          let live = liveByTaskId.get(row.taskId)
          if (live === undefined) {
            live = await isLive(row.taskId)
            liveByTaskId.set(row.taskId, live)
          }
          if (live || seenTasks.has(row.taskId)) continue
          seenTasks.add(row.taskId)
          taskIds.push(row.taskId)
          continue
        }
        if (row.added === 1) {
          items.push({ subscriptionId: row.subscriptionId, itemId: row.itemId })
        }
      }
      return segment(() => driver.clearQueueLinkRows(now(), taskIds, items))
    }
  })
}

export const createSqliteMetaStore = ({
  db,
  now,
  generateId
}: CreateSqliteStoresOptions): MetaStore => {
  const driver = createDrizzleMetaDriver({ db, now, generateId })
  const segment = <A>(work: () => A): A => runDrizzleSegment(db, work)
  return withDriverErrors<MetaStore>({
    async readLeader() { return segment(() => driver.readLeader()) },
    async casLeader(request) { return segment(() => driver.casLeader(request)) },
    async readPreferred() { return segment(() => driver.readPreferred()) },
    async writePreferred(kind) { return segment(() => driver.writePreferred(kind)) }
  })
}

/** Standalone metadata owns one warmed runtime; database facades share the handle owner. */
export class InMemoryMetaStore implements MetaStore {
  private readonly runtime = ManagedRuntime.make(
    SubscriptionMetaMemoryLive.pipe(
      Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield, true))
    )
  )

  constructor() { this.runtime.runSync(Effect.void) }

  async readLeader(): Promise<LeaderState> {
    return runLegacySync(this.runtime, Effect.flatMap(SubscriptionMeta, meta => meta.readLeader), legacyError)
  }

  async casLeader(request: Parameters<MetaStore['casLeader']>[0]): Promise<boolean> {
    return runLegacySync(this.runtime, Effect.flatMap(SubscriptionMeta, meta => meta.casLeader(request)), legacyError)
  }

  async readPreferred(): Promise<LeaderKind | null> {
    return runLegacySync(this.runtime, Effect.flatMap(SubscriptionMeta, meta => meta.readPreferred), legacyError)
  }

  async writePreferred(kind: LeaderKind | null): Promise<void> {
    return runLegacySync(this.runtime, Effect.flatMap(SubscriptionMeta, meta => meta.writePreferred(kind)), legacyError)
  }
}
