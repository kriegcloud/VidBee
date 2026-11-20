import { InMemoryMetaStore } from '@vidbee/subscriptions-core-legacy/store'
import { SubscriptionsApi, type SubscriptionsApiOptions } from '@vidbee/subscriptions-core-legacy/api'
import type { SubscriptionsStore } from '@vidbee/subscriptions-core-legacy/store'
import type { SubscriptionRule, SubscriptionWithItems } from '@vidbee/subscriptions-core-legacy/types'

export const rule = (patch: Partial<SubscriptionWithItems> = {}): SubscriptionWithItems => ({
  id: 'sub', title: 'Fixture', sourceUrl: 'https://fixture.invalid/page', feedUrl: 'https://fixture.invalid/feed',
  platform: 'custom', keywords: [], tags: [], onlyDownloadLatest: false, autoDownload: true,
  enabled: true, status: 'idle', createdAt: 10, updatedAt: 10, sourceKind: 'feed', categories: [], items: [], ...patch
})
export const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export const turns = async (count = 20) => { for (let index = 0; index < count; index++) await Promise.resolve() }
export const host = (options: Partial<SubscriptionsApiOptions> = {}, initial = [rule()]) => {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]))
  const trace: unknown[] = []
  const store: SubscriptionsStore = {
    async list() { trace.push(['list']); return [...rows.values()].map((row) => structuredClone(row)) },
    async get(id) { trace.push(['get', id]); const row = rows.get(id); return row ? structuredClone(row) : null },
    async findDuplicateFeed(url, ignore) { trace.push(['duplicate', url, ignore]); return [...rows.values()].find((row) => row.feedUrl === url && row.id !== ignore)?.id ?? null },
    async add(input) { const row = rule({ ...input, id: 'created', title: input.title ?? input.sourceUrl }); rows.set(row.id, row); trace.push(['add', structuredClone(input)]); return structuredClone(row) },
    async update(id, patch) { trace.push(['update', id, structuredClone(patch)]); const row = rows.get(id); if (!row) return null; Object.assign(row, patch); return structuredClone(row) },
    async remove(id) { trace.push(['remove', id]); return rows.delete(id) },
    async replaceItems(id, items) { trace.push(['replace', id, structuredClone(items)]); const row = rows.get(id); if (row) row.items = items.map((item) => ({ ...item, addedToQueue: false })) },
    async mergeItems(id, items) { trace.push(['merge', id, structuredClone(items)]); const row = rows.get(id); if (row) for (const item of items) { const previous = row.items.find((entry) => entry.id === item.id); if (previous) Object.assign(previous, item); else row.items.push({ ...item, addedToQueue: false }) } },
    async markItemQueued(id, itemId, taskId) { trace.push(['mark', id, itemId, taskId]); const item = rows.get(id)?.items.find((entry) => entry.id === itemId); if (item) Object.assign(item, { addedToQueue: Boolean(taskId), taskId: taskId ?? undefined }) },
    async clearQueueLinks(selector) { trace.push(['clear', structuredClone(selector)]); return 1 },
    async clearOrphanedQueueLinks() { trace.push(['orphans']); return 0 }
  }
  const api = new SubscriptionsApi({ kind: 'desktop', pid: 1, store, metaStore: new InMemoryMetaStore(),
    fetcher: { async fetch(url) { trace.push(['fetch', url]); return { items: [] } } },
    async enqueueItem(context) { trace.push(['enqueue', structuredClone(context)]); return 'task' },
    now: () => 1000, log: (level, message, metadata) => trace.push(['log', level, message, metadata]), ...options })
  return { api, store, rows, trace }
}
export const profile = (patch: Partial<SubscriptionRule> = {}) => rule({ platform: 'instagram', sourceKind: 'profile', categories: ['stories', 'posts'], ...patch })
