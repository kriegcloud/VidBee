import { afterEach, expect, it, vi } from '@effect/vitest'
import { FeedCheckScheduler } from '@vidbee/subscriptions-core/scheduler'
import { host, rule, profile, deferred, turns } from './fixtures/api-host'

vi.setConfig({ testTimeout: 120000 })
afterEach(() => vi.restoreAllMocks())
const entries = ['a', 'b'].map((id) => ({ guid: id, link: `https://fixture.invalid/${id}`, title: id, isoDate: '2020-01-01T00:00:00Z' }))
const timers = { scheduleInterval: () => 1, clearInterval: () => undefined }
const scheduler = { setTimeoutImpl: () => 1, clearTimeoutImpl: () => undefined }
it('history callback order and complete RSS/profile admission payloads', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  for (const source of ['feed', 'profile']) {
    const calls: string[] = []
    const h = host({ isHistoryDup: (url) => { calls.push(url); return url.endsWith('/a') }, fetcher: { fetch: async () => ({ items: entries }) }, profileFetcher: { fetch: async () => ({ items: entries.map((entry) => ({ id: entry.guid, url: entry.link, title: entry.title, publishedAt: 1000, category: 'posts' })), categoryErrors: {} }) } }, [source === 'feed' ? rule() : profile({ categories: ['posts'] })])
    await h.api.refreshOne('sub')
    expect({ source, calls, trace: h.trace, row: h.rows.get('sub') }).toMatchSnapshot()
  }
})
it('leader due/forced passes skip disabled rows, continue after failure and profiles ignore RSS lease', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  for (const leader of [false, true]) {
    const sentinel = new Error('initial write failed')
    const rows = [rule({ id: 'due' }), rule({ id: 'later', nextCheckAt: 9999 }), rule({ id: 'disabled', enabled: false }), profile({ id: 'profile' }), rule({ id: 'broken' }), rule({ id: 'after' })]
    const h = host({ leader: timers, scheduler, profileFetcher: { fetch: async () => ({ items: [], categoryErrors: {} }) } }, rows)
    const update = h.store.update
    h.store.update = async (id, patch) => { if (id === 'broken') throw sentinel; return update(id, patch) }
    if (leader) await h.api.start()
    h.trace.length = 0
    await h.api.refreshAll()
    const due = structuredClone(h.trace)
    h.trace.length = 0
    await h.api.refreshAll({ force: true })
    const warnings = h.trace.filter((entry) => Array.isArray(entry) && entry[2] === 'subscriptions: refreshOne failed')
    expect(warnings).toHaveLength(1)
    expect(Reflect.get(Reflect.get(warnings, '0')[3], 'err')).toBe(sentinel)
    expect({ leader, due, forced: h.trace, rows: [...h.rows.values()] }).toMatchSnapshot()
    await h.api.stop()
  }
})
it('RSS success metadata preserves custom titles and guards permissive parser values', async () => {
  for (const title of ['', 'https://fixture.invalid/page', 'https://fixture.invalid/feed', 'Custom']) {
    for (const malformed of [false, true]) {
      const feed = malformed ? { title: 42, link: {}, items: [] } : { title: '  T  ', link: ' https://fixture.invalid/home ', image: { url: 'cover' }, items: [] }
      const h = host({ fetcher: { fetch: async () => JSON.parse(JSON.stringify(feed)) } }, [rule({ title })])
      await h.api.refreshOne('sub')
      expect({ title, malformed, trace: h.trace, row: h.rows.get('sub') }).toMatchSnapshot()
    }
  }
})
it('profile rejection retains original reason and stale retry plan after edits or removal', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  for (const reason of [new Error('boom'), { x: 1 }]) for (const removed of [false, true]) {
    const gate = deferred<never>()
    const logs: unknown[][] = []
    const h = host({ profileFetcher: { fetch: () => gate.promise }, log: (...args) => logs.push(args) }, [profile({ checkIntervalMs: 900 })])
    h.api.on('changed', () => h.trace.push(['changed']))
    const pending = h.api.refreshOne('sub')
    await turns()
    if (removed) await h.api.remove({ id: 'sub' })
    else await h.api.update({ id: 'sub', categories: ['posts'], checkIntervalMs: 100 })
    gate.reject(reason)
    await pending
    expect(Reflect.get(Reflect.get(logs, '0')[2], 'err')).toBe(reason)
    expect({ removed, logs, trace: h.trace, row: h.rows.get('sub') }).toMatchSnapshot()
  }
})
it('update duplicate descriptor and enabled replan', async () => {
  const h = host({}, [rule({ nextCheckAt: 9 }), rule({ id: 'second', feedUrl: 'X' })])
  const rejected = h.api.update({ id: 'sub', feedUrl: 'X' })
  await expect(rejected).rejects.toEqual(Object.assign(new Error('SUBSCRIPTION_DUPLICATE_FEED_URL'), { duplicateOf: 'second' }))
  const error = await rejected.catch((reason: unknown) => reason)
  expect(error).toBeInstanceOf(Error)
  if (error instanceof Error) expect(error.constructor).toBe(Error)
  expect(Object.getOwnPropertyDescriptor(error, 'duplicateOf')).toEqual({ value: 'second', writable: true, enumerable: true, configurable: true })
  expect(h.trace).toEqual([['duplicate', 'X', 'sub']])
  await h.api.update({ id: 'sub', enabled: true })
  expect({ trace: h.trace, row: h.rows.get('sub') }).toMatchSnapshot()
})
it('empty refresh runs full due pass before missing-ID rejection', async () => {
  const h = host({ leader: timers, scheduler }, [rule(), rule({ id: 'second' })])
  await h.api.start(); h.trace.length = 0
  try {
    await expect(h.api.refresh({ id: '' })).rejects.toEqual(new Error('Subscription not found: '))
    expect(h.trace).toMatchSnapshot()
  } finally { await h.api.stop() }
  const calls: unknown[] = []
  const bare = new FeedCheckScheduler({ runAll: async () => { calls.push('all') }, runOne: async (id) => { calls.push(['one', id]) }, isLeader: () => true })
  await bare.triggerNow('')
  expect(calls).toEqual(['all'])
})
it('API scheduler rearm and repeated refresh use injected clock and 30-second dedupe', async () => {
  let clock = 1000
  let tick: (() => void) | undefined
  const schedules: number[] = []
  const h = host({ now: () => clock, leader: timers, scheduler: { setTimeoutImpl: (callback, ms) => { tick = callback; schedules.push(ms); return 1 }, clearTimeoutImpl: () => undefined } })
  await h.api.start()
  try {
    tick?.(); await turns(100)
    expect(schedules).toEqual([0, 300000])
    h.trace.length = 0
    const rows = [await h.api.refresh({ id: 'sub' }), await h.api.refresh({ id: 'sub' })]
    expect(h.trace.filter((entry) => Array.isArray(entry) && entry[0] === 'fetch')).toHaveLength(1)
    clock = 31000
    rows.push(await h.api.refresh({ id: 'sub' }))
    expect(h.trace.filter((entry) => Array.isArray(entry) && entry[0] === 'fetch')).toHaveLength(2)
    expect({ rows, trace: h.trace, schedules }).toMatchSnapshot()
  } finally { await h.api.stop() }
})
it('reconciliation and removal warning retain arguments and changed-event positions', async () => {
  const reason = new Error('clear failed')
  const h = host({ taskExists: () => false, leader: timers, scheduler })
  h.store.clearOrphanedQueueLinks = async (callback) => { h.trace.push(['orphans', callback === undefined ? 'absent' : await callback('task')]); return 2 }
  h.api.on('changed', () => h.trace.push(['changed']))
  expect(await h.api.reconcileOrphanedTasks()).toBe(2)
  await h.api.start(); await h.api.stop()
  h.store.clearQueueLinks = async () => { throw reason }
  h.api.noteTaskRemoved('task'); await turns()
  const warning = h.trace.find((entry) => Array.isArray(entry) && entry[2] === 'subscriptions: failed to release removed tasks')
  expect(Array.isArray(warning) && Reflect.get(warning[3], 'err')).toBe(reason)
  const lease = h.trace.find((entry) => Array.isArray(entry) && entry[2] === 'leader: acquired lease')
  if (Array.isArray(lease)) expect(lease[3]).toEqual({ kind: 'desktop', pid: 1, leaseId: expect.any(String) })
  expect(h.trace.map((entry) => Array.isArray(entry) && entry[2] === 'leader: acquired lease' ? [...entry.slice(0, 3), { ...entry[3], leaseId: '<lease>' }] : entry)).toMatchSnapshot()
})
it('wrong-kind JSON pagination and update results remain complete', async () => {
  const h = host({}, [rule({ ...profile(), items: ['a', 'b', 'c', 'd'].map((id) => ({ id, url: id, title: id, publishedAt: 1, addedToQueue: false })) })])
  const observations: unknown[] = []
  for (const offset of [null, '1', '2', true, false]) for (const limit of [null, '1', '2', true, false]) observations.push([offset, limit, await Reflect.apply(h.api.itemsList, h.api, [{ subscriptionId: 'sub', offset, limit }])])
  for (const patch of [{ categories: 'posts' }, { enabled: 'true' }, { checkIntervalMs: 0 }, { checkIntervalMs: false }, { checkIntervalMs: '' }, { feedUrl: '' }]) observations.push([patch, await Reflect.apply(h.api.update, h.api, [{ id: 'sub', ...patch }])])
  expect(observations).toMatchSnapshot()
})
