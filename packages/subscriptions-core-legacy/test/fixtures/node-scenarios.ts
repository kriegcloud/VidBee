import assert from 'node:assert/strict'
import { RssParserFeedFetcher } from '@vidbee/subscriptions-core-legacy/feed-parser'
import { normalizeFeedItems } from '@vidbee/subscriptions-core-legacy/feed-items'
import { FeedCheckScheduler } from '@vidbee/subscriptions-core-legacy/scheduler'
import { LeaderElection } from '@vidbee/subscriptions-core-legacy/leader'
import { InMemoryMetaStore } from '@vidbee/subscriptions-core-legacy/store'
import Parser from 'rss-parser'
import { host, turns } from './api-host'

const scenario = process.argv[2]
const trace: unknown[] = []
const xml = '<rss version="2.0" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><channel><title>Fixture</title><link>https://fixture.invalid/</link><description>Fixture</description><item><title>A</title><link>https://fixture.invalid/a</link><guid>a</guid><yt:videoId><nested>abc</nested></yt:videoId></item></channel></rss>'
const response = (body: string) => new Response(body)
if (scenario === 'malformed') {
  globalThis.fetch = async () => { trace.push('request'); return response(xml) }
  const fetcher = new RssParserFeedFetcher()
  const feed = await fetcher.fetch('https://fixture.invalid/feed')
  let traversal: unknown
  try { normalizeFeedItems(feed.items) } catch (error) { traversal = error }
  assert.ok(traversal instanceof TypeError)
  assert.equal(traversal.message, 'candidate.trim is not a function')
  trace.push(['traversal', traversal.name, traversal.message])
  const { api, rows, trace: apiTrace } = host({ fetcher, log: (level, message, metadata) => {
    assert.equal(level, 'warn'); assert.equal(message, 'subscriptions: feed-check failed')
    assert.ok(metadata && typeof metadata === 'object' && 'err' in metadata && metadata.err instanceof TypeError)
    trace.push(['log', level, message, metadata.err.name, metadata.err.message])
  } })
  await api.refreshOne('sub'); trace.push('refresh-fulfilled')
  assert.equal(rows.get('sub')?.lastError, 'candidate.trim is not a function')
  assert.ok(!apiTrace.some((entry) => Array.isArray(entry) && ['replace', 'enqueue'].includes(String(entry[0]))))
  trace.push(apiTrace, rows.get('sub'))
 } else if (scenario === 'timing') {
  const { api, rows, trace: operations } = host()
  const listener = () => { trace.push(['listener', rows.get('sub')?.title]); return Promise.resolve().then(() => trace.push('ignored-listener-promise')) }
  const off = api.on('changed', listener); const duplicate = api.on('changed', listener)
  const mark = (label: string) => { trace.push(label); queueMicrotask(() => { trace.push(label + ':microtask1'); queueMicrotask(() => trace.push(label + ':microtask2')) }) }
  const updating = api.update({ id: 'sub', title: 'Edited' }).then((result) => { trace.push(['update-settle', result]); return result })
  mark('returned-update'); await updating
  trace.push(['unsubscribe', off(), off(), duplicate()])
  api.on('changed', listener); trace.push(['stale-unsubscribe', off()])
  const refresh = api.refreshOne('sub').then(() => trace.push('refresh-settle'))
  mark('returned-refresh'); await refresh
  const removal = api.remove({ id: 'sub' }).then((result) => trace.push(['remove-settle', result]))
  trace.push(['immediate-remove', rows.has('sub')]); mark('returned-remove'); await removal
  trace.push(operations)
} else if (scenario === 'api-ledger') {
  type Api = ReturnType<typeof host>['api']
  const operations: [string, (api: Api) => unknown][] = [
    ['list', (api) => api.list()], ['get', (api) => api.get({ id: 'sub' })],
    ['resolve', (api) => api.resolve({ rawUrl: 'fixture.invalid' })],
    ['add', (api) => api.add({ sourceUrl: 'source', feedUrl: 'another', platform: 'custom' })],
    ['update', (api) => api.update({ id: 'sub', title: 'Changed' })],
    ['remove', (api) => api.remove({ id: 'sub' })], ['refresh', (api) => api.refresh({ id: 'sub' })],
    ['itemsList', (api) => api.itemsList({ subscriptionId: 'sub' })],
    ['itemsQueue', (api) => api.itemsQueue({ subscriptionId: 'sub', itemId: 'a' })],
    ['releaseRemovedTasks', (api) => api.releaseRemovedTasks(['task'])],
    ['reconcile', (api) => api.reconcileOrphanedTasks()], ['refreshAll', (api) => api.refreshAll()],
    ['refreshAllForced', (api) => api.refreshAll({ force: true })], ['refreshOne', (api) => api.refreshOne('sub')],
    ['start', (api) => api.start()], ['stop', (api) => api.stop()],
    ['observeLeader', (api) => api.observeLeader()], ['isLeader', (api) => api.isLeader()],
    ['noteTaskRemoved', (api) => api.noteTaskRemoved(' task ')]
  ]
  for (const [name, operation] of operations) {
    const h = host({ taskExists: () => true, log: (level, message) => h.trace.push(['log', level, message]),
      leader: { scheduleInterval: () => 'interval', clearInterval() {} },
      scheduler: { setTimeoutImpl: () => 'timeout', clearTimeoutImpl() {} } })
    const record: unknown[] = []
    h.api.on('changed', () => record.push(['changed', structuredClone([...h.rows.values()])]))
    const returned = operation(h.api)
    record.push(['returned', returned instanceof Promise ? 'Promise' : typeof returned, structuredClone([...h.rows.values()]), structuredClone(h.trace)])
    let marker = 0
    const enqueueMarker = () => { record.push(['microtask', ++marker]); if (marker < 12) queueMicrotask(enqueueMarker) }
    queueMicrotask(enqueueMarker)
    const result = await Promise.resolve(returned).then((value) => { record.push(['settled', value]); return value })
    record.push(['awaited', result]); await turns(30)
    trace.push([name, record, h.trace, [...h.rows.values()]])
    await h.api.stop()
  }
} else if (scenario === 'network-cancel') {
  const originalFetch = globalThis.fetch
  try {
    for (const reason of [null, false, 0, 'reason', { reason: 'object' }]) {
      const controller = new AbortController(); controller.abort(reason); let requests = 0
      globalThis.fetch = () => { requests++; return Promise.reject(new Error('must not fetch')) }
      await assert.rejects(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed', controller.signal), (error) => error === reason)
      trace.push(['preabort', reason, requests, 'identity'])
    }
    const controller = new AbortController(); const reason = { body: 'abort' }; let requests = 0
    globalThis.fetch = (_input, options) => {
      requests++; assert.ok(options?.signal instanceof AbortSignal)
      return Promise.resolve(new Response('body')).then((response) => {
        response.text = () => { controller.abort(reason); return Promise.reject(new Error('body failure')) }
        return response
      })
    }
    await assert.rejects(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed', controller.signal), (error) => error === reason)
    trace.push(['body-abort', requests, 'identity', controller.signal.reason === reason])
    const failure = { fetch: 'failure' }; const calls: unknown[] = []
    globalThis.fetch = (input, options) => { calls.push([input, { ...options, signal: '<AbortSignal>' }]); return Promise.reject(failure) }
    await assert.rejects(new RssParserFeedFetcher().fetch('http://fixture.invalid/feed'), (error) => error === failure)
    trace.push(calls, 'fetch-identity')
  } finally { globalThis.fetch = originalFetch }
} else if (scenario === 'dates') {
  // Zone-less dates intentionally differ by TZ; the same per-zone fixture is used from either cwd.
  for (const isoDate of ['2020-01-02', '2020-01-02T03:04:05', '2020-01-02T03:04:05Z', '2020-03-08T02:30:00', '2020-11-01T01:30:00', 'bad']) {
    let calls = 0
    trace.push([isoDate, normalizeFeedItems([{ guid: 'a', title: 'A', link: 'u', isoDate, pubDate: 'Wed, 01 Jan 2020 00:00:00 GMT' }, { guid: 'b', title: 'B', link: 'v' }], { now: () => ++calls }), calls])
  }
  const raw = [{ guid: 'a', title: 'A', link: 'u', isoDate: 1 }, { guid: 'b', title: 'B', link: 'v', isoDate: null }]
  trace.push(Reflect.apply(normalizeFeedItems, undefined, [raw, { now: () => 7 }]))
  const failure = { coercion: 'sentinel' }
  assert.throws(() => Reflect.apply(normalizeFeedItems, undefined, [[{ guid: 'a', title: 'A', link: 'u', isoDate: { toString() { throw failure } } }]]), (reason) => reason === failure)
  trace.push('coercion-identity')
} else if (scenario === 'parse-abort' || scenario === 'candidate-abort') {
  const controller = new AbortController(); const reason = { abort: scenario }
  const original = Parser.prototype.parseString
  const requests: unknown[] = []
  globalThis.fetch = async (input, options) => { requests.push([input, options?.method, options?.redirect]); return response(scenario === 'parse-abort' ? '<rss version="2.0"><channel><title>F</title></channel></rss>' : '<html><link rel=alternate type=application/rss+xml href=/one><link rel=alternate type=application/rss+xml href=/two></html>') }
  Parser.prototype.parseString = function (...args: Parameters<typeof original>) {
    const parsed = Reflect.apply(original, this, args)
    // A successful parser completion can abort a caller before the fetcher's post-parse check.
    if (scenario === 'parse-abort') return parsed.then((feed) => { controller.abort(reason); return feed })
    if (requests.length === 2) controller.abort(reason)
    return parsed
  }
  try {
    const fetcher = new RssParserFeedFetcher()
    await assert.rejects(scenario === 'parse-abort' ? fetcher.fetch('https://fixture.invalid/feed', controller.signal) : fetcher.probe('https://fixture.invalid/page', controller.signal), (error) => error === reason)
    assert.equal(requests.length, scenario === 'parse-abort' ? 1 : 2)
    trace.push(requests, 'reason-identity', controller.signal.aborted)
  } finally { Parser.prototype.parseString = original }
} else if (scenario === 'heartbeat' || scenario === 'tick-logger' || scenario === 'pending-logger' || scenario === 'rearm' || scenario === 'finally-precedence' || scenario === 'removal' || scenario === 'skip-logger') {
  const failure = { sentinel: scenario }; const displaced = { displaced: true }
  const rejection = new Promise<void>((resolve, reject) => {
    let count = 0
    process.on('unhandledRejection', (reason) => {
      try { assert.equal(reason, failure); trace.push(['unhandled', ++count, 'identity']); setImmediate(() => { assert.equal(count, 1); resolve() }) } catch (error) { reject(error) }
    })
  })
  if (scenario === 'heartbeat') {
    const meta = new InMemoryMetaStore(); let callback: (() => void) | undefined
    const leader = new LeaderElection({ metaStore: meta, kind: 'desktop', pid: 1, now: () => 10, scheduleInterval(cb) { callback = cb; return 1 }, clearInterval() {} })
    await leader.tryAcquire()
    meta.casLeader = () => Promise.reject(failure)
    trace.push(['callback-return', callback?.()]); assert.equal(leader.isLeader(), true)
  } else if (scenario === 'removal') {
    const { api, store } = host({ log: () => { throw failure } })
    store.clearQueueLinks = () => Promise.reject(displaced)
    trace.push(['note-return', api.noteTaskRemoved(' task ')])
  } else {
    let callback: (() => void) | undefined; let schedules = 0; let runs = 0
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const scheduler = new FeedCheckScheduler({ isLeader: () => scenario !== 'skip-logger',
      runAll() { trace.push(['run', ++runs]); return scenario === 'pending-logger' && runs === 1 ? pending : scenario === 'rearm' ? Promise.resolve() : Promise.reject(displaced) },
      async runOne() {}, log: () => { trace.push('log'); throw scenario === 'finally-precedence' ? displaced : failure },
      setTimeoutImpl(cb, ms) { trace.push(['schedule', ++schedules, ms]); callback = cb; if (schedules > 1 && ['rearm', 'finally-precedence'].includes(scenario)) throw failure; return schedules }, clearTimeoutImpl() {} })
    scheduler.start(); trace.push(['callback-return', callback?.()])
    if (scenario === 'pending-logger') { await scheduler.triggerNow(); trace.push('pending-trigger-fulfilled'); finish() }
  }
  await rejection
} else if (scenario === 'liveness') {
  const realSetTimeout = globalThis.setTimeout; const realSetInterval = globalThis.setInterval
  const intervals: ReturnType<typeof setInterval>[] = []; const timeouts: ReturnType<typeof setTimeout>[] = []
  // Observe default handles without changing their ref policy; release only resources made here.
  globalThis.setTimeout = Object.assign((...args: Parameters<typeof setTimeout>) => { const handle = Reflect.apply(realSetTimeout, globalThis, args); timeouts.push(handle); return handle }, realSetTimeout)
  globalThis.setInterval = Object.assign((...args: Parameters<typeof setInterval>) => { const handle = Reflect.apply(realSetInterval, globalThis, args); intervals.push(handle); return handle }, realSetInterval)
  const leader = new LeaderElection({ metaStore: new InMemoryMetaStore(), kind: 'desktop', pid: 1 })
  await leader.tryAcquire()
  const scheduler = new FeedCheckScheduler({ async runAll() {}, async runOne() {}, isLeader: () => true }); scheduler.start(60000)
  globalThis.fetch = async () => { trace.push(['fetch-timeout-ref', timeouts.at(-1)?.hasRef()]); return response('<rss version="2.0"><channel><title>F</title></channel></rss>') }
  await new RssParserFeedFetcher().fetch('https://fixture.invalid/feed')
  trace.push(['scheduler-ref', timeouts[0]?.hasRef()], ['heartbeat-ref', intervals[0]?.hasRef()])
  assert.equal(timeouts[0]?.hasRef(), true); assert.equal(intervals[0]?.hasRef(), true)
  scheduler.stop(); await leader.release()
  globalThis.setTimeout = realSetTimeout; globalThis.setInterval = realSetInterval
  process.on('beforeExit', () => { trace.push('beforeExit-after-release'); process.stdout.write(JSON.stringify(trace) + '\n') })
} else throw new Error(`Unknown Node scenario ${scenario}`)
await turns()
if (scenario !== 'liveness') process.stdout.write(JSON.stringify(trace, (_key, value: unknown) => value === undefined ? { $undefined: true } : value) + '\n')
