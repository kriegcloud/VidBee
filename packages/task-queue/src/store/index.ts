/**
 * TaskStore — in-memory authoritative index of Task records, indexed by id and
 * by groupKey/status. Only the orchestrator writes here; consumers receive
 * read-only snapshots.
 */
import type { Task, TaskKind, TaskQueueStats, TaskSnapshot, TaskStatus } from '../types'

const STATUSES: readonly TaskStatus[] = [
  'queued',
  'running',
  'processing',
  'paused',
  'retry-scheduled',
  'completed',
  'failed',
  'cancelled'
]

export class TaskStore {
  private readonly byId = new Map<string, Task>()
  private readonly byGroup = new Map<string, Set<string>>()
  private readonly byParent = new Map<string | null, Set<string>>()
  private readonly byStatus = new Map<TaskStatus, Set<string>>()
  private readonly listings = new Map<string, { ids: string[]; positions: Map<string, number> }>()

  constructor() {
    for (const s of STATUSES) {
      this.byStatus.set(s, new Set())
    }
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  get(id: string): Readonly<Task> | undefined {
    return this.byId.get(id)
  }

  /** Insert a new task. Throws if id already exists. */
  insert(task: Task): void {
    if (this.byId.has(task.id)) {
      throw new Error(`TaskStore: duplicate id ${task.id}`)
    }
    this.byId.set(task.id, task)
    this.bucket(this.byGroup, task.groupKey).add(task.id)
    this.bucket(this.byParent, task.parentId).add(task.id)
    this.bucket(this.byStatus, task.status).add(task.id)
    this.listings.clear()
  }

  /**
   * Replace the existing record. Maintains index consistency for status and
   * groupKey transitions. Throws if the id is missing.
   */
  update(next: Task): void {
    const prev = this.byId.get(next.id)
    if (!prev) {
      throw new Error(`TaskStore: missing id ${next.id}`)
    }
    if (prev.status !== next.status) {
      this.byStatus.get(prev.status)?.delete(prev.id)
      this.byStatus.get(next.status)?.add(next.id)
    }
    if (prev.groupKey !== next.groupKey) {
      const oldBucket = this.byGroup.get(prev.groupKey)
      oldBucket?.delete(prev.id)
      if (oldBucket && oldBucket.size === 0) {
        this.byGroup.delete(prev.groupKey)
      }
      this.bucket(this.byGroup, next.groupKey).add(next.id)
    }
    if (prev.parentId !== next.parentId) {
      const oldBucket = this.byParent.get(prev.parentId)
      oldBucket?.delete(prev.id)
      if (oldBucket?.size === 0) {
        this.byParent.delete(prev.parentId)
      }
      this.bucket(this.byParent, next.parentId).add(next.id)
    }
    if (
      prev.status !== next.status ||
      prev.groupKey !== next.groupKey ||
      prev.parentId !== next.parentId ||
      prev.createdAt !== next.createdAt
    ) {
      this.listings.clear()
    }
    this.byId.set(next.id, next)
  }

  /** Remove a record (used by removeFromHistory). */
  remove(id: string): boolean {
    const prev = this.byId.get(id)
    if (!prev) {
      return false
    }
    this.byId.delete(id)
    this.byStatus.get(prev.status)?.delete(id)
    const groupSet = this.byGroup.get(prev.groupKey)
    groupSet?.delete(id)
    if (groupSet && groupSet.size === 0) {
      this.byGroup.delete(prev.groupKey)
    }
    const parentSet = this.byParent.get(prev.parentId)
    parentSet?.delete(id)
    if (parentSet?.size === 0) {
      this.byParent.delete(prev.parentId)
    }
    this.listings.clear()
    return true
  }

  snapshot(id: string): TaskSnapshot | undefined {
    const t = this.byId.get(id)
    return t ? { task: t } : undefined
  }

  list(opts?: {
    query?: string
    kind?: TaskKind
    status?: TaskStatus
    groupKey?: string
    parentId?: string
    limit?: number
    cursor?: string | null
  }): { tasks: Task[]; nextCursor: string | null } {
    const query = opts?.query?.trim().toLocaleLowerCase()
    const kind = opts?.kind
    // Query/kind filters depend on mutable task fields (title), so they bypass
    // the id-listing cache, which is only invalidated on index transitions.
    const cacheable = !(query || kind)
    const key = JSON.stringify([opts?.status, opts?.groupKey, opts?.parentId])
    let listing = cacheable ? this.listings.get(key) : undefined
    if (!listing) {
      const candidates = opts?.parentId
        ? (this.byParent.get(opts.parentId) ?? [])
        : opts?.status
          ? (this.byStatus.get(opts.status) ?? [])
          : opts?.groupKey
            ? (this.byGroup.get(opts.groupKey) ?? [])
            : this.byId.keys()
      const all: Task[] = []
      for (const id of candidates) {
        const t = this.byId.get(id)
        if (!t) {
          continue
        }
        if (opts?.status && t.status !== opts.status) {
          continue
        }
        if (opts?.groupKey && t.groupKey !== opts.groupKey) {
          continue
        }
        if (opts?.parentId && t.parentId !== opts.parentId) {
          continue
        }
        if (kind && t.kind !== kind) {
          continue
        }
        if (
          query &&
          !`${t.id}\n${t.input.title ?? ''}\n${t.input.url}`.toLocaleLowerCase().includes(query)
        ) {
          continue
        }
        all.push(t)
      }
      all.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const ids = all.map((t) => t.id)
      listing = { ids, positions: new Map(ids.map((id, index) => [id, index])) }
      if (cacheable) {
        // Bound retained query combinations, including one-off parent lookups.
        if (this.listings.size >= 32) {
          const oldest = this.listings.keys().next().value
          if (oldest !== undefined) {
            this.listings.delete(oldest)
          }
        }
        this.listings.set(key, listing)
      }
    }
    const startIdx = opts?.cursor ? (listing.positions.get(opts.cursor) ?? -1) + 1 : 0
    const limit = opts?.limit ?? 100
    // Cache ids rather than task objects so progress/title updates are always fresh.
    const slice: Task[] = []
    for (const id of listing.ids.slice(startIdx, startIdx + limit)) {
      const task = this.byId.get(id)
      if (task) {
        slice.push(task)
      }
    }
    const nextCursor =
      startIdx + slice.length < listing.ids.length && slice.length > 0
        ? (slice.at(-1)?.id ?? null)
        : null
    return { tasks: slice, nextCursor }
  }

  stats(capacity: number): TaskQueueStats {
    const byStatus: Record<TaskStatus, number> = {
      queued: 0,
      running: 0,
      processing: 0,
      paused: 0,
      'retry-scheduled': 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    }
    for (const s of STATUSES) {
      byStatus[s] = this.byStatus.get(s)?.size ?? 0
    }
    const perGroup: Record<string, number> = {}
    for (const [k, set] of this.byGroup) {
      perGroup[k] = set.size
    }
    return {
      total: this.byId.size,
      byStatus,
      running: byStatus.running,
      queued: byStatus.queued,
      capacity,
      perGroup
    }
  }

  size(): number {
    return this.byId.size
  }

  private bucket<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
    let s = map.get(key)
    if (!s) {
      s = new Set<V>()
      map.set(key, s)
    }
    return s
  }
}
