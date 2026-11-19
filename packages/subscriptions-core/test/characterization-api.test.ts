import { expect, it, vi } from 'vitest'
import { SubscriptionsApi } from '@vidbee/subscriptions-core'
import { SUBSCRIPTION_DUPLICATE_FEED_ERROR, SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR } from '@vidbee/subscriptions-core/api'
import type { ParsedFeed, ProfileCheckResult } from '@vidbee/subscriptions-core/types'
import { deferred, host, profile, rule, turns } from './fixtures/api-host'

vi.setConfig({ testTimeout: 120000 })

it('root class identity, missing-resource errors are rejected Promises, resolve is synchronous', async () => {
  const { api } = host()
  expect(api).toBeInstanceOf(SubscriptionsApi)
  expect(api.resolve({ rawUrl: 'fixture.invalid/feed' })).not.toBeInstanceOf(Promise)
  for (const operation of [() => api.get({ id: 'absent' }), () => api.update({ id: 'absent' }), () => api.refresh({ id: 'absent' }), () => api.itemsList({ subscriptionId: 'absent' }), () => api.itemsQueue({ subscriptionId: 'absent', itemId: 'a' })]) {
    let pending: unknown
    expect(() => { pending = operation() }).not.toThrow()
    expect(pending).toBeInstanceOf(Promise)
    await expect(pending).rejects.toEqual(new Error('Subscription not found: absent'))
  }
  expect(await api.remove({ id: 'absent' })).toEqual({})
})
it('add normalizes profile/feed inputs before guards; duplicate carries mutable own duplicateOf', async () => {
  const { api } = host()
  const input = { sourceUrl: 'https://fixture.invalid/page', feedUrl: 'https://fixture.invalid/feed', platform: 'custom' as const }
  try { await api.add(input); throw new Error('expected duplicate') } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect(error).toHaveProperty('message', SUBSCRIPTION_DUPLICATE_FEED_ERROR)
    expect(Object.getOwnPropertyDescriptor(error, 'duplicateOf')).toEqual({ value: 'sub', writable: true, configurable: true, enumerable: true })
  }
  await expect(api.add({ ...input, platform: 'instagram', categories: [] })).rejects.toEqual(new Error('Choose at least one category to follow.'))
  await expect(api.add({ ...input, platform: 'instagram' })).rejects.toEqual(new Error(SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR))
  const desktop = host({ profileFetcher: { async fetch() { return { items: [], categoryErrors: {} } } } }, [])
  expect(await desktop.api.add({ ...input, platform: 'instagram', keywords: ['ignored'], onlyDownloadLatest: true, categories: ['posts', 'stories', 'bogus', 'posts'] })).toMatchSnapshot()
  expect(desktop.trace).toMatchSnapshot()
})
it('list/itemsList complete values and slice coercion including negative, zero and NaN', async () => {
  const items = ['a', 'b', 'c'].map((id, publishedAt) => ({ id, title: id, url: `https://fixture.invalid/${id}`, publishedAt, addedToQueue: false }))
  const { api } = host({}, [rule({ items })])
  const results: unknown[] = [await api.list()]
  for (const offset of [undefined, -1, 0, 1, NaN]) for (const limit of [undefined, -1, 0, 1, NaN]) results.push({ offset, limit, result: await api.itemsList({ subscriptionId: 'sub', offset, limit }) })
  expect(results).toMatchSnapshot()
})
it('update validates categories against OLD platform and leaves source kind/owner untouched', async () => {
  const { api, trace } = host({}, [profile({ profileOwner: 'old', checkIntervalMs: 5, nextCheckAt: 9 })])
  const result = await api.update({ id: 'sub', platform: 'x', sourceUrl: 'changed', categories: ['posts', 'media'], checkIntervalMs: null })
  expect(result).toEqual(profile({ platform: 'x', sourceUrl: 'changed', profileOwner: 'old', categories: ['posts'], checkIntervalMs: undefined, nextCheckAt: undefined }))
  expect(trace).toMatchSnapshot()
})
it('listeners use live insertion order, dedupe, removal/re-entry and stale unsubscribe booleans', async () => {
  const { api, rows } = host()
  const events: unknown[] = []
  const late = () => events.push(['late', rows.has('sub')])
  const removed = () => events.push('must be removed')
  let removeOther = () => {}
  const first = () => { events.push(['first', rows.has('sub')]); removeOther(); api.on('changed', late) }
  const off = api.on('changed', first)
  const duplicateOff = api.on('changed', first)
  removeOther = api.on('changed', removed)
  const pending = api.remove({ id: 'sub' })
  events.push(['returned', rows.has('sub')])
  queueMicrotask(() => events.push('marker'))
  await pending
  events.push(['off', off(), off(), duplicateOff()])
  api.on('changed', first)
  events.push(['stale', duplicateOff()])
  await api.remove({ id: 'sub' })
  expect(events).toMatchSnapshot()
})
it('listener returns are ignored, thrown listener logs once and continues; throwing logger escapes after mutation', async () => {
  const { api, trace } = host()
  const returned = deferred<void>()
  const sentinel = new Error('listener-sentinel')
  api.on('changed', () => returned.promise)
  api.on('changed', () => { throw sentinel })
  api.on('changed', () => trace.push('last'))
  await api.remove({ id: 'sub' })
  expect(trace).toMatchSnapshot()
  returned.resolve()
  const logFailure = { log: 'sentinel' }
  const other = host({ log: () => { throw logFailure } })
  other.api.on('changed', () => { throw sentinel })
  await expect(other.api.remove({ id: 'sub' })).rejects.toBe(logFailure)
  expect(other.rows.has('sub')).toBe(false)
})
it('refreshOne same-ID joins work, distinct IDs overlap, direct checks bypass enabled/due/leader', async () => {
  const gate = deferred<ParsedFeed>()
  const fetched: string[] = []
  const { api, trace } = host({ fetcher: { fetch(url) { fetched.push(url); return gate.promise } } }, [rule({ enabled: false, nextCheckAt: 9999 }), rule({ id: 'second', feedUrl: 'https://fixture.invalid/second' })])
  const first = api.refreshOne('sub'); const joined = api.refreshOne('sub'); const second = api.refreshOne('second')
  expect(trace).toEqual([['get', 'sub'], ['get', 'second']])
  await turns()
  expect(fetched).toEqual(['https://fixture.invalid/feed', 'https://fixture.invalid/second'])
  gate.resolve({ title: 'Feed', items: [] })
  await Promise.all([first, joined, second])
  expect(trace).toMatchSnapshot()
})
it('RSS survives update/remove/stop during fetch; profile removal aborts its owned signal', async () => {
  const feed = deferred<ParsedFeed>()
  const rss = host({ fetcher: { fetch: () => feed.promise } })
  const pending = rss.api.refreshOne('sub'); await turns()
  await rss.api.update({ id: 'sub', autoDownload: false })
  await rss.api.remove({ id: 'sub' }); await rss.api.stop()
  feed.resolve({ items: [{ guid: 'a', title: 'A', link: 'https://fixture.invalid/a', isoDate: '2020-01-01T00:00:00Z' }] })
  await pending
  expect(rss.trace).toMatchSnapshot()
  const mapped = deferred<ProfileCheckResult>(); let signal: AbortSignal | undefined
  const account = host({ profileFetcher: { fetch(_sub, supplied) { signal = supplied; return mapped.promise } } }, [profile()])
  const check = account.api.refreshOne('sub'); await turns()
  expect(signal?.aborted).toBe(false)
  await account.api.remove({ id: 'sub' })
  expect(signal?.aborted).toBe(true)
  expect(signal?.reason).toHaveProperty('name', 'AbortError')
  mapped.resolve({ items: [{ id: 'a', category: 'posts', url: 'https://fixture.invalid/a' }], categoryErrors: {} })
  await check
  expect(account.trace).toMatchSnapshot()
})
for (const outerThrows of [false, true]) it(`inner enqueue-warning logger failure; outer logger throws=${outerThrows}`, async () => {
  const enqueue = new Error('enqueue-sentinel'); const log = new Error('log-sentinel'); const logs: unknown[] = []
  const { api, rows, trace } = host({
    fetcher: { async fetch() { return { items: [{ guid: 'a', title: 'A', link: 'https://fixture.invalid/a', isoDate: '2020-01-01T00:00:00Z' }] } } },
    enqueueItem: () => Promise.reject(enqueue),
    log: (level, message, metadata) => { logs.push([level, message, metadata]); if (outerThrows || message.includes('enqueueItem')) throw log }
  })
  const refresh = api.refreshOne('sub')
  if (outerThrows) await expect(refresh).rejects.toBe(log); else await expect(refresh).resolves.toBeUndefined()
  expect({ trace, logs, row: rows.get('sub') }).toMatchSnapshot()
})
it('manual queue has no per-item lock; passes complete metadata and does not catch admission failures', async () => {
  const gate = deferred<string | null>(); const calls: unknown[] = []
  const { api, trace } = host({ enqueueItem(context) { calls.push(context); return gate.promise } }, [rule({ items: [{ id: 'a', title: 'A', url: 'https://fixture.invalid/a', publishedAt: 4, thumbnail: 'thumb', addedToQueue: false }] })])
  const one = api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' }); const two = api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' })
  await turns(); expect(calls).toHaveLength(2)
  gate.resolve('task'); expect(await Promise.all([one, two])).toEqual([{ queued: true, taskId: 'task' }, { queued: true, taskId: 'task' }])
  expect({ calls, trace }).toMatchSnapshot()
  const failure = { admission: 'failure' }; const rejected = host({ enqueueItem: () => Promise.reject(failure) }, [rule({ items: [{ id: 'a', title: 'A', url: 'u', publishedAt: 4, addedToQueue: false }] })])
  await expect(rejected.api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' })).rejects.toBe(failure)
})
for (const lookup of ['absent', 'live', 'missing', 'throws'] as const) it(`manual queue link policy: ${lookup}`, async () => {
  const failure = new Error('lookup-sentinel')
  const { api, trace } = host({ ...(lookup === 'absent' ? {} : { taskExists: () => { if (lookup === 'throws') throw failure; return lookup === 'live' } }) }, [rule({ items: [{ id: 'a', title: 'A', url: 'u', publishedAt: 4, addedToQueue: true, taskId: 'old' }] })])
  if (lookup === 'throws') await expect(api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' })).rejects.toBe(failure)
  else expect(await api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' })).toEqual(lookup === 'missing' ? { queued: true, taskId: 'task' } : { queued: false, taskId: 'old' })
  expect(trace).toMatchSnapshot()
})
it('task removal is synchronous bookkeeping, batches one microtask, permits overlapping releases', async () => {
  const { api, store, trace } = host()
  const gate = deferred<number>(); store.clearQueueLinks = (selector) => { trace.push(['clear-pending', selector]); return gate.promise }
  expect(api.noteTaskRemoved(' a ')).toBeUndefined(); api.noteTaskRemoved('a'); api.noteTaskRemoved(' '); api.noteTaskRemoved('b')
  expect(trace).toEqual([])
  queueMicrotask(() => trace.push('marker'))
  await Promise.resolve()
  api.noteTaskRemoved('c')
  await turns()
  expect(trace).toEqual([['clear-pending', { taskIds: ['a', 'b'] }], 'marker', ['clear-pending', { taskIds: ['c'] }]])
  await api.stop(); gate.resolve(2); await turns()
  expect(trace).toMatchSnapshot()
})
it('API startup lease loser is not reacquired by scheduled or forced refreshes', async () => {
  const { InMemoryMetaStore } = await import('@vidbee/subscriptions-core/store')
  const meta = new InMemoryMetaStore()
  await meta.casLeader({ expectedLeaseId: null, now: 0, next: { kind: 'api', pid: 2, startedAt: 0, heartbeatAt: 0, lockExpiresAt: 2000, leaseId: 'other' } })
  let tick: (() => void) | undefined; let clock = 1000
  const { api, trace } = host({ metaStore: meta, now: () => clock, scheduler: { setTimeoutImpl(cb) { tick = cb; return 1 }, clearTimeoutImpl() {} } })
  await api.start(); expect(api.isLeader()).toBe(false)
  clock = 5000; tick?.(); await turns(); expect(api.isLeader()).toBe(false)
  expect(trace.some((entry) => Array.isArray(entry) && entry[0] === 'fetch')).toBe(false)
  await api.refreshAll({ force: true }); expect(api.isLeader()).toBe(false)
  expect(trace).toMatchSnapshot(); await api.stop()
})

it('unknown persisted enum text and preference values reach policy and enqueue unchanged', async () => {
  const stored = rule({ downloadType: 'audio', downloadQuality: 'best', downloadContainer: 'mp4' })
  for (const [key, value] of Object.entries({ platform: 'future-platform', status: 'future-status', downloadType: 'future-type', downloadQuality: 'future-quality', downloadContainer: 'future-container' })) Reflect.set(stored, key, value)
  const received: unknown[] = []
  const { api, rows, trace } = host({ fetcher: { async fetch() { return { items: [{ guid: 'a', title: 'A', link: 'url', isoDate: '2020-01-01T00:00:00Z' }] } } }, async enqueueItem(context) { received.push(context); return null } }, [stored])
  await api.refreshOne('sub'); await api.refreshOne('sub')
  expect({ received, trace, row: rows.get('sub') }).toMatchSnapshot()
  expect(received).toHaveLength(1)
})
it('profile check uses edits made during fetch, retains full batch context and samples one discovery time', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  try {
    const gate = deferred<ProfileCheckResult>(); const received: unknown[] = []
    const { api, rows, trace } = host({ profileFetcher: { fetch: () => gate.promise }, async enqueueItem(context) { received.push(context); return 'profile-task' } }, [profile({ title: 'https://fixture.invalid/page' })])
    const pending = api.refreshOne('sub'); await turns()
    await api.update({ id: 'sub', categories: ['posts'], checkIntervalMs: 100 })
    gate.resolve({ title: '  Named profile  ', avatarUrl: 'avatar', categoryErrors: { stories: 'rate-limited' }, items: [{ id: 'a', category: 'stories', url: 'story' }, { id: 'b', category: 'posts', url: 'post' }], error: 'ignored unfollowed error' })
    await pending
    expect({ received, trace, row: rows.get('sub') }).toMatchSnapshot()
  } finally { vi.restoreAllMocks() }
})
it('initial profile write/event occurs before try; removal still aborts controller after rejected write', async () => {
  const { api, store, trace } = host({ profileFetcher: { async fetch() { throw new Error('unreachable') } } }, [profile()])
  const sentinel = { initial: 'write' }
  store.update = () => Promise.reject(sentinel)
  await expect(api.refreshOne('sub')).rejects.toBe(sentinel)
  await expect(api.remove({ id: 'sub' })).resolves.toEqual({})
  expect(trace).toEqual([['get', 'sub'], ['remove', 'sub']])
})
it('initial checking SQL failure escapes; failed-state write failure rejects with original value', async () => {
  for (const phase of ['initial', 'failed'] as const) {
    const sentinel = { write: phase }; const { api, store, trace } = host({ fetcher: { fetch: () => Promise.reject(new Error('fetch-sentinel')) } })
    const update = store.update
    store.update = (id, patch) => patch.status === (phase === 'initial' ? 'checking' : 'failed') ? Promise.reject(sentinel) : update(id, patch)
    await expect(api.refreshOne('sub')).rejects.toBe(sentinel)
    expect(trace).toMatchSnapshot()
  }
})
it('manual creator metadata is passed by identity, null/empty admission outcomes retain actual semantics', async () => {
  const metadata: NonNullable<Parameters<SubscriptionsApi['itemsQueue']>[1]> = { origin: 'agent', agentConversation: { downloadId: 'download', threadId: 'thread', promptId: 'prompt' } }
  const contexts: unknown[] = []
  const { api, rows, trace } = host({ async enqueueItem(context) { expect(context.creation).toBe(metadata); contexts.push(context); return 'task' } }, [rule({ items: [{ id: 'a', title: 'A', url: 'url', publishedAt: 4, addedToQueue: false }] })])
  expect(await api.itemsQueue({ subscriptionId: 'sub', itemId: 'missing' })).toEqual({ queued: false, taskId: null })
  expect(await api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' }, metadata)).toEqual({ queued: true, taskId: 'task' })
  expect({ contexts, trace, row: rows.get('sub') }).toMatchSnapshot()
  for (const taskId of [null, '']) {
    const received: unknown[] = []
    const other = host({ async enqueueItem(context) { received.push(context); return taskId } }, [rule({ items: [{ id: 'a', title: 'A', url: 'url', publishedAt: 4, addedToQueue: false }] })])
    expect(await other.api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' })).toEqual({ queued: taskId !== null, taskId })
    expect({ received, trace: other.trace }).toMatchSnapshot()
  }
})
it('startup reconciliation failure is caught before timer, while acquisition failure stops startup', async () => {
  const { InMemoryMetaStore } = await import('@vidbee/subscriptions-core/store')
  const meta = new InMemoryMetaStore(); const sentinel = { acquisition: 'failure' }
  meta.readLeader = () => Promise.reject(sentinel)
  const failed = host({ metaStore: meta, scheduler: { setTimeoutImpl() { throw new Error('must not schedule') } } })
  await expect(failed.api.start()).rejects.toBe(sentinel)
  const state = new InMemoryMetaStore(); const trace: unknown[] = []
  const other = host({ metaStore: state, taskExists: () => true, leader: { scheduleInterval: () => 1, clearInterval() {} }, scheduler: { setTimeoutImpl(_cb, ms) { trace.push(['schedule', ms]); return 1 }, clearTimeoutImpl() {} }, log: (level, message, metadata) => trace.push([level, message, metadata && typeof metadata === 'object' && 'err' in metadata ? metadata.err : '<lease>']) })
  other.store.clearOrphanedQueueLinks = () => Promise.reject(sentinel)
  await other.api.start(); await other.api.stop()
  expect(trace).toMatchSnapshot()
})
