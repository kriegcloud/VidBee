import type { SubscriptionsApi, SubscriptionsApiOptions } from '../../src/api.js'
import type { SubscriptionsStore } from '../../src/store.js'
import type { SubscriptionWithItems, ParsedFeed, ProfileCheckResult, LeaderState } from '../../src/types.js'
import type { FeedCheckScheduler, FeedCheckSchedulerOptions } from '../../src/scheduler.js'
import type { LeaderElection, LeaderElectionOptions, MetaStore } from '../../src/leader.js'

export interface StatefulConstructors {
  readonly SubscriptionsApi: new (options: SubscriptionsApiOptions) => SubscriptionsApi
  readonly FeedCheckScheduler: new (options: FeedCheckSchedulerOptions) => FeedCheckScheduler
  readonly LeaderElection: new (options: LeaderElectionOptions) => LeaderElection
}
const deferred = <A>() => {
  let resolve!: (value: A) => void
  const promise = new Promise<A>(yes => { resolve = yes })
  return { promise, resolve }
}
const turns = async () => { for (let index = 0; index < 60; index++) await Promise.resolve() }
const initial = (id = 'a', patch: Partial<SubscriptionWithItems> = {}): SubscriptionWithItems => ({
  id, title: `Subscription ${id}`, sourceUrl: `https://fixture.invalid/${id}`, feedUrl: `https://fixture.invalid/${id}/feed`,
  platform: 'custom', keywords: [], tags: [], onlyDownloadLatest: false, autoDownload: true, enabled: true,
  status: 'idle', createdAt: 10, updatedAt: 10, sourceKind: 'feed', categories: [], items: [], ...patch,
})
const feed: ParsedFeed = { title: 'Fetched title', link: 'https://fixture.invalid/home', items: [
  { guid: 'one', title: 'One', link: 'https://fixture.invalid/one', isoDate: '2020-01-01T00:00:00Z' },
  { guid: 'two', title: 'Two', link: 'https://fixture.invalid/two', isoDate: '2020-01-02T00:00:00Z' },
] }
const profileResult: ProfileCheckResult = { title: 'Profile title', items: [
  { id: 'post', category: 'posts', title: 'Post', url: 'https://fixture.invalid/post', publishedAt: 20 },
  { id: 'story', category: 'stories', title: 'Story', url: 'https://fixture.invalid/story', publishedAt: 30 },
], categoryErrors: {}, retryAfter: 100_000 }
interface Hold { readonly key: string; readonly ordinal: number; readonly reached: ReturnType<typeof deferred<void>>; readonly release: ReturnType<typeof deferred<void>> }
const makeRecorder = () => {
  const trace: unknown[] = []
  const leaseIds = new Map<string, string>()
  const canonical = (value: unknown, key = ''): unknown => {
    if (value === undefined) return { $undefined: true }
    if (value instanceof Error) return { error: value.name, message: value.message, ...('duplicateOf' in value ? { duplicateOf: value.duplicateOf } : {}) }
    if ((key === 'leaseId' || key === 'expectedLeaseId') && typeof value === 'string' && value !== 'other') {
      if (!leaseIds.has(value)) leaseIds.set(value, `<lease:${leaseIds.size + 1}>`)
      return leaseIds.get(value)
    }
    if (Array.isArray(value)) return value.map(entry => canonical(entry))
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, canonical(entry, name)]))
    return value
  }
  const record = (...values: unknown[]) => { trace.push(canonical(values)) }
  return { trace, record, canonical }
}
const makeHost = (constructors: StatefulConstructors, seed = [initial()], profile = false) => {
  const { trace, record, canonical } = makeRecorder()
  const rows = new Map(seed.map(row => [row.id, structuredClone(row)]))
  const failures = new Map<string, unknown>()
  const counts = new Map<string, number>()
  const holds: Hold[] = []
  const tasks = new Set<string>()
  const timers = new Map<number, () => void>()
  let nextTimer = 0
  let nextTask = 0
  let now = 1000
  let signal: AbortSignal | undefined
  let logFailure: string | undefined
  let onCall: ((key: string) => void) | undefined
  const hold = (key: string, ordinal = (counts.get(key) ?? 0) + 1): Hold => {
    const entry = { key, ordinal, reached: deferred<void>(), release: deferred<void>() }
    holds.push(entry)
    return entry
  }
  const perform = <A>(key: string, args: unknown, action: () => A): Promise<A> => {
    record('call', key, args)
    const ordinal = (counts.get(key) ?? 0) + 1
    counts.set(key, ordinal)
    onCall?.(key)
    const failureKey = failures.has(`${key}#${ordinal}`) ? `${key}#${ordinal}` : key
    if (failures.has(failureKey)) { const failure = failures.get(failureKey); record('reject', key, failure); return Promise.reject(failure) }
    let value: A
    try { value = action() } catch (error) { return Promise.reject(error) }
    const waiting = holds.find(entry => entry.key === key && entry.ordinal === ordinal)
    if (waiting) {
      record('held', key, ordinal)
      waiting.reached.resolve()
      return waiting.release.promise.then(() => { record('released', key, ordinal); return value })
    }
    return Promise.resolve(value)
  }
  const clear = (selector: Parameters<SubscriptionsStore['clearQueueLinks']>[0]) => {
    let changed = 0
    for (const row of rows.values()) for (const item of row.items) {
      if ((selector.taskIds?.includes(item.taskId ?? '') || selector.items?.some(entry => entry.subscriptionId === row.id && entry.itemId === item.id)) && (item.addedToQueue || item.taskId)) {
        item.addedToQueue = false; item.taskId = undefined; changed++
      }
    }
    return changed
  }
  const store: SubscriptionsStore = {
    list: () => perform('list', [], () => [...rows.values()].map(row => structuredClone(row))),
    get: id => perform('get', [id], () => rows.has(id) ? structuredClone(rows.get(id)!) : null),
    findDuplicateFeed: (url, ignore) => perform('duplicate', [url, ignore], () => [...rows.values()].find(row => row.feedUrl === url && row.id !== ignore)?.id ?? null),
    add: input => perform('add', input, () => { const row = initial('created', { ...input, title: input.title ?? input.sourceUrl }); rows.set(row.id, row); return structuredClone(row) }),
    update: (id, patch) => perform(`update:${patch.status ?? 'edit'}`, [id, patch], () => { const row = rows.get(id); if (!row) return null; Object.assign(row, patch); return structuredClone(row) }),
    remove: id => perform('remove', [id], () => rows.delete(id)),
    replaceItems: (id, items) => perform('replace', [id, items], () => { const row = rows.get(id); if (row) row.items = items.map(item => { const previous = row.items.find(old => old.id === item.id); return { ...item, addedToQueue: previous?.addedToQueue ?? false, taskId: previous?.taskId } }) }),
    mergeItems: (id, items) => perform('merge', [id, items], () => { const row = rows.get(id); if (row) for (const item of items) { const previous = row.items.find(old => old.id === item.id); if (previous) Object.assign(previous, item); else row.items.push({ ...item, addedToQueue: false }) } }),
    markItemQueued: (id, itemId, taskId) => perform('mark', [id, itemId, taskId], () => { const item = rows.get(id)?.items.find(entry => entry.id === itemId); if (item) Object.assign(item, { addedToQueue: Boolean(taskId), taskId: taskId ?? undefined }) }),
    clearQueueLinks: selector => perform('clear', selector, () => clear(selector)),
    clearOrphanedQueueLinks: async live => { record('call', 'orphans'); let changed = 0; for (const row of rows.values()) for (const item of row.items) if (item.taskId && !await live(item.taskId)) changed += clear({ taskIds: [item.taskId] }); return changed },
  }
  let state: LeaderState = { kind: null, pid: null, startedAt: null, heartbeatAt: null, lockExpiresAt: null, leaseId: null, preferred: null }
  const meta: MetaStore = {
    readLeader: () => perform('meta:read', [], () => ({ ...state })),
    casLeader: request => perform('meta:cas', request, () => { if (state.leaseId !== request.expectedLeaseId && state.lockExpiresAt !== null && state.lockExpiresAt > request.now) return false; state = { ...state, ...request.next }; return true }),
    readPreferred: () => perform('meta:preferred', [], () => state.preferred),
    writePreferred: kind => perform('meta:writePreferred', [kind], () => { state.preferred = kind }),
  }
  const schedule = (kind: string, callback: () => void, ms: number) => { const id = ++nextTimer; timers.set(id, callback); record('timer:add', kind, id, ms); return id }
  const unschedule = (kind: string, id: unknown) => { timers.delete(Number(id)); record('timer:remove', kind, id) }
  const options: SubscriptionsApiOptions = {
    kind: 'desktop', pid: 1, store, metaStore: meta,
    fetcher: { fetch: url => perform('fetch', [url], () => structuredClone(feed)) },
    ...(profile ? { profileFetcher: { fetch: (subscription: SubscriptionWithItems, supplied?: AbortSignal) => {
      signal = supplied; supplied?.addEventListener('abort', () => record('profile:abort', supplied.aborted, supplied.reason instanceof Error ? { name: supplied.reason.name, message: supplied.reason.message } : supplied.reason), { once: true })
      return perform('profile', subscription, () => structuredClone(profileResult))
    } } } : {}),
    enqueueItem: context => perform('enqueue', context, () => { const id = `task-${++nextTask}`; tasks.add(id); return id }),
    taskExists: id => perform('taskExists', [id], () => tasks.has(id)),
    isHistoryDup: url => { record('history', url); if (failures.has('history')) throw failures.get('history'); return false },
    now: () => now,
    log: (level, message, metadata) => { record('log', level, message, metadata); if (logFailure && message.includes(logFailure)) throw new Error('logger-sentinel') },
    leader: { scheduleInterval: (callback, ms) => schedule('interval', callback, ms), clearInterval: id => unschedule('interval', id) },
    scheduler: { setTimeoutImpl: (callback, ms) => schedule('timeout', callback, ms), clearTimeoutImpl: id => unschedule('timeout', id) },
  }
  const api = new constructors.SubscriptionsApi(options)
  const settled = async (label: string, pending: Promise<unknown>) => {
    try { record('settled', label, await pending) } catch (error) { record('failed', label, error, failures.size > 0 && [...failures.values()].includes(error)) }
  }
  const snapshot = async (label: string) => {
    record('snapshot', label, { rows: [...rows.values()], leader: api.isLeader(), signal: signal === undefined ? undefined : signal.aborted })
    record('reader:list', label, await api.list())
    for (const id of ['a', 'b', 'created']) {
      await settled(`reader:get:${label}:${id}`, api.get({ id }))
      await settled(`reader:items:${label}:${id}`, api.itemsList({ subscriptionId: id, offset: 0, limit: 10 }))
    }
  }
  api.on('changed', () => record('changed', [...rows.values()]))
  return { api, store, rows, tasks, trace, record, canonical, hold, failures, counts, timers, meta, options, settled, snapshot,
    setNow: (value: number) => { now = value }, setLogFailure: (value: string | undefined) => { logFailure = value },
    setOnCall: (value: ((key: string) => void) | undefined) => { onCall = value }, getSignal: () => signal }
}

export const STATEFUL_SCENARIOS = [
  'crud-queue-requeue', 'public-refresh-dedupe', 'concurrent-refresh', 'profile-remove', 'profile-edit-admission-remove', 'listeners-reentrant', 'listener-logger-failure',
  ...['get', 'update:checking', 'fetch', 'replace', 'enqueue', 'mark', 'get#2', 'update:up-to-date'].map(point => `remove-at:${point}`),
  ...['get', 'update:checking', 'profile', 'get#2', 'merge', 'enqueue', 'mark', 'update:up-to-date'].map(point => `profile-remove-at:${point}`),
  ...['get', 'update:checking', 'fetch', 'replace', 'enqueue', 'mark', 'get#2', 'update:up-to-date', 'history'].map(point => `feed-failure:${point}`),
  ...['get', 'update:checking', 'profile', 'get#2', 'merge', 'enqueue', 'mark', 'update:up-to-date'].map(point => `profile-failure:${point}`),
  ...['taskExists', 'clear', 'enqueue', 'mark'].map(point => `queue-failure:${point}`),
  'failure-state-write', 'enqueue-inner-logger', 'enqueue-outer-logger', 'removal-batches', 'lifecycle-stop-pending', 'lifecycle-startup-loser', 'scheduler-stop-restart', 'leader-transitions',
] as const

export const runStatefulScenario = async (constructors: StatefulConstructors, scenario: string): Promise<unknown[]> => {
  const random = Math.random
  Math.random = () => 0.5
  try {
    if (scenario === 'scheduler-stop-restart') return await schedulerScenario(constructors)
    if (scenario === 'leader-transitions') return await leaderScenario(constructors)
    const profile = scenario.startsWith('profile-')
    const h = makeHost(constructors, profile ? [initial('a', { platform: 'instagram', sourceKind: 'profile', categories: ['posts', 'stories'] })] : scenario === 'concurrent-refresh' ? [initial(), initial('b')] : [initial()], profile)
    const { api, record, hold, settled, snapshot } = h
    if (scenario === 'public-refresh-dedupe') {
      const fetching = hold('fetch')
      const pending = settled('refresh:first', api.refresh({ id: 'a' }))
      await fetching.reached.promise
      await settled('refresh:duplicate', api.refresh({ id: 'a' })); await snapshot('first-held-duplicate-returned')
      await settled('disable', api.update({ id: 'a', enabled: false }))
      fetching.release.resolve(); await pending; await snapshot('first-finished')
      h.setNow(32_000); h.failures.set('fetch', new Error('public-fetch-sentinel'))
      await settled('refresh:failed-check', api.refresh({ id: 'a' })); await snapshot('failed-check')
      h.failures.clear()
      await settled('refresh:failed-dedupe', api.refresh({ id: 'a' })); await snapshot('failure-consumed-dedupe')
      h.setNow(63_000); await settled('refresh:retry', api.refresh({ id: 'a' })); await snapshot('retry-after-window')
    } else if (scenario === 'lifecycle-stop-pending') {
      const fetching = hold('fetch')
      h.rows.get('a')!.items = [{ id: 'old', title: 'Old', url: 'https://fixture.invalid/old', publishedAt: 1, addedToQueue: true, taskId: 'stale' }]
      await settled('start', api.start()); await snapshot('started')
      record('tick:return', h.timers.get(2)?.()); await fetching.reached.promise
      const joined = settled('joined-tick', api.refreshOne('a'))
      await settled('stop-pending', api.stop()); await snapshot('stopped-with-fetch')
      fetching.release.resolve(); await joined; await turns(); await snapshot('completed-after-stop')
      await settled('restart', api.start()); await snapshot('restarted'); await settled('stop-again', api.stop())
    } else if (scenario === 'lifecycle-startup-loser') {
      await h.meta.casLeader({ expectedLeaseId: null, now: 1000, next: { kind: 'api', pid: 2, startedAt: 1000, heartbeatAt: 1000, lockExpiresAt: 2000, leaseId: 'other' } })
      await settled('start', api.start()); await snapshot('startup-loser')
      h.setNow(3000); record('tick:return', h.timers.get(1)?.()); await turns(); await snapshot('expired-no-reacquire')
      await settled('forced', api.refreshAll({ force: true })); await snapshot('forced-without-lease')
      await settled('stop', api.stop())
    } else if (scenario === 'crud-queue-requeue') {
      await settled('add', api.add({ sourceUrl: 'https://fixture.invalid/new', feedUrl: 'https://fixture.invalid/new/feed', platform: 'custom', downloadDirectory: '/fixture/downloads' }))
      await snapshot('added')
      await settled('update', api.update({ id: 'created', enabled: false, title: 'Edited', tags: ['tag'], checkIntervalMs: null }))
      await settled('forced', api.refreshAll({ force: true }))
      await snapshot('refreshed')
      h.tasks.clear()
      const gate = hold('enqueue')
      const first = settled('queue:one', api.itemsQueue({ subscriptionId: 'a', itemId: 'one' }))
      const second = settled('queue:two', api.itemsQueue({ subscriptionId: 'a', itemId: 'one' }))
      await turns(); await snapshot('queue-held'); gate.release.resolve(); await Promise.all([first, second])
      h.tasks.clear()
      await settled('requeue', api.itemsQueue({ subscriptionId: 'a', itemId: 'one' }))
      await snapshot('requeued')
      await settled('remove-created', api.remove({ id: 'created' }))
      await snapshot('removed')
    } else if (scenario === 'concurrent-refresh') {
      const one = hold('fetch'), two = hold('fetch', 2)
      const first = settled('a:first', api.refreshOne('a')), joined = settled('a:joined', api.refreshOne('a')), other = settled('b', api.refreshOne('b'))
      await Promise.all([one.reached.promise, two.reached.promise]); await snapshot('both-fetching')
      await settled('update-during', api.update({ id: 'a', enabled: false, autoDownload: false }))
      two.release.resolve(); await other; await snapshot('b-finished')
      one.release.resolve(); await Promise.all([first, joined]); await snapshot('all-finished')
      await settled('repeat-direct', api.refreshOne('a')); await snapshot('after-repeat')
    } else if (scenario.startsWith('remove-at:') || scenario.startsWith('profile-remove-at:')) {
      const point = scenario.slice(scenario.indexOf(':') + 1)
      const [key, ordinal] = point.split('#')
      const gate = hold(key!, ordinal === undefined ? undefined : Number(ordinal))
      const pending = settled('check', api.refreshOne('a'))
      await gate.reached.promise; await snapshot('held')
      await settled('disable', api.update({ id: 'a', enabled: false }))
      await settled('remove', api.remove({ id: 'a' })); await settled('stop', api.stop()); await snapshot('removed-held')
      gate.release.resolve(); await pending; await snapshot('finished')
    } else if (scenario === 'profile-remove' || scenario === 'profile-edit-admission-remove') {
      const mapping = hold('profile'), admission = scenario === 'profile-edit-admission-remove' ? hold('enqueue') : undefined
      const pending = settled('profile-check', api.refreshOne('a'))
      await mapping.reached.promise; await snapshot('mapping')
      if (admission) {
        await settled('edit', api.update({ id: 'a', categories: ['posts'], title: 'Edited profile' }))
        mapping.release.resolve(); await admission.reached.promise; await snapshot('admission')
        await settled('remove', api.remove({ id: 'a' })); await settled('stop', api.stop()); admission.release.resolve()
      } else {
        await settled('remove', api.remove({ id: 'a' })); await settled('stop', api.stop()); mapping.release.resolve()
      }
      await pending; await snapshot('finished')
    } else if (scenario === 'listeners-reentrant' || scenario === 'listener-logger-failure') {
      const nested: Promise<void>[] = []; let entered = false
      const late = () => record('listener:late')
      let removeOther = () => {}
      const first = () => {
        record('listener:first'); removeOther(); api.on('changed', late)
        if (!entered) { entered = true; nested.push(settled('reentrant-update', api.update({ id: 'a', title: 'Reentrant' }))) }
      }
      const off = api.on('changed', first), duplicate = api.on('changed', first)
      removeOther = api.on('changed', () => record('listener:removed'))
      api.on('changed', () => { record('listener:throw'); throw new Error('listener-sentinel') })
      api.on('changed', () => { record('listener:ignored-return'); return Promise.resolve().then(() => record('listener:ignored-microtask')) })
      if (scenario === 'listener-logger-failure') h.setLogFailure('listener threw')
      await settled('update', api.update({ id: 'a', title: 'Outer' })); await Promise.all(nested); await turns()
      record('unsubscribed', off(), off(), duplicate()); api.on('changed', first); record('stale', off()); await snapshot('finished')
    } else if (scenario === 'removal-batches') {
      h.rows.get('a')!.items = [{ id: 'one', title: 'One', url: 'https://fixture.invalid/one', publishedAt: 10, addedToQueue: true, taskId: 'task-1' }]
      const first = hold('clear'), second = hold('clear', 2)
      record('note-return', api.noteTaskRemoved(' task-1 ')); api.noteTaskRemoved('task-1'); api.noteTaskRemoved(' ')
      await first.reached.promise; api.noteTaskRemoved('task-2'); await second.reached.promise
      await settled('stop', api.stop()); await snapshot('releases-held')
      second.release.resolve(); await turns(); first.release.resolve(); await turns(); await snapshot('finished')
    } else if (scenario.startsWith('queue-failure:')) {
      const point = scenario.slice('queue-failure:'.length)
      h.rows.get('a')!.items = [{ id: 'one', title: 'One', url: 'https://fixture.invalid/one', publishedAt: 10, addedToQueue: true, taskId: 'stale' }]
      h.failures.set(point, { sentinel: point })
      await settled('queue', api.itemsQueue({ subscriptionId: 'a', itemId: 'one' })); await snapshot('failed')
    } else {
      const point = scenario.startsWith('feed-failure:') ? scenario.slice('feed-failure:'.length) : scenario.startsWith('profile-failure:') ? scenario.slice('profile-failure:'.length) : 'enqueue'
      if (scenario === 'failure-state-write') { h.failures.set('fetch', new Error('fetch-sentinel')); h.failures.set('update:failed', { sentinel: 'failed-write' }) }
      else h.failures.set(point, new Error(`${point}-sentinel`))
      if (scenario === 'enqueue-inner-logger') h.setLogFailure('enqueueItem failed')
      if (scenario === 'enqueue-outer-logger') h.setLogFailure('subscriptions:')
      await settled('check', api.refreshOne('a')); await snapshot('failed')
      h.failures.clear(); h.setLogFailure(undefined)
      await settled('retry', api.refreshOne('a')); await snapshot('retried')
    }
    await settled('final-stop', api.stop())
    return h.trace
  } finally { Math.random = random }
}

const schedulerScenario = async (constructors: StatefulConstructors): Promise<unknown[]> => {
  const { trace, record } = makeRecorder(); const timers = new Map<number, () => void>(); let serial = 0; let now = 1000
  const work = deferred<void>(); let runs = 0; let leader = true
  const scheduler = new constructors.FeedCheckScheduler({ intervalMs: 100, refreshDedupeWindowMs: 30, now: () => now, isLeader: () => leader,
    runAll: () => { record('all', ++runs); return runs === 1 ? work.promise : Promise.resolve() },
    runOne: async id => { record('one', id) }, log: (level, message, metadata) => record('log', level, message, metadata),
    setTimeoutImpl: (callback, ms) => { const id = ++serial; timers.set(id, callback); record('timer:add', id, ms); return id },
    clearTimeoutImpl: handle => { record('timer:clear', handle); timers.delete(Number(handle)) },
  })
  scheduler.start(0); record('returned:start', [...timers.keys()]); timers.get(1)?.(); await turns()
  await scheduler.triggerNow(); record('queued-rerun'); scheduler.stop(); record('returned:stop', [...timers.keys()])
  work.resolve(); await turns(); record('work-finished', [...timers.keys()]); scheduler.start(5)
  await scheduler.triggerNow('a'); await scheduler.triggerNow('a'); now += 31; await scheduler.triggerNow('a')
  leader = false; timers.get(serial)?.(); await turns(); scheduler.stop(); record('finished', [...timers.keys()])
  return trace
}
const leaderScenario = async (constructors: StatefulConstructors): Promise<unknown[]> => {
  const h = makeHost(constructors)
  const leader = new constructors.LeaderElection({ metaStore: h.meta, kind: 'desktop', pid: 1, now: () => 1000,
    scheduleInterval: callback => { h.record('heartbeat:scheduled'); h.timers.set(1, callback); return 1 }, clearInterval: handle => { h.record('heartbeat:cleared', handle); h.timers.delete(Number(handle)) },
    log: (level, message, metadata) => h.record('leader:log', level, message, metadata), onStateChange: (state, local) => h.record('leader:state', state, local),
  })
  h.record('acquire', await leader.tryAcquire(), leader.isLeader()); h.record('observe', await leader.observe()); h.record('heartbeat', await leader.heartbeat())
  h.record('reacquire-own', await leader.tryAcquire(), leader.isLeader()); h.record('observe-after-reacquire', await leader.observe())
  await leader.release(); h.record('released', leader.isLeader(), await leader.observe())
  await h.meta.writePreferred('api'); h.record('preferred-other', await leader.tryAcquire(), leader.isLeader())
  await h.meta.writePreferred(null); await leader.release(); h.record('final', await leader.observe())
  return h.trace
}

// The permanent Vitest wrapper runs this branch with the pinned Node interpreter.
// Imported by the old recorder, this module supplies the same host/scenario logic without loading NEW.
if (process.argv[2] === '--run-stateful') {
  const [api, scheduler, leader] = await Promise.all([
    import('../../src/api.js'), import('../../src/scheduler.js'), import('../../src/leader.js'),
  ])
  const constructors: StatefulConstructors = { SubscriptionsApi: api.SubscriptionsApi, FeedCheckScheduler: scheduler.FeedCheckScheduler, LeaderElection: leader.LeaderElection }
  const results: Record<string, unknown> = {}
  for (const scenario of STATEFUL_SCENARIOS) results[scenario] = await runStatefulScenario(constructors, scenario)
  process.stdout.write(JSON.stringify(results) + '\n')
}
