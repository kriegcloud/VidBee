import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { releaseHandle } from '@vidbee/db/legacy'
import {
  SUBSCRIPTIONS_DDL_V1,
  SUBSCRIPTIONS_DDL_V2,
  SUBSCRIPTIONS_V3_COLUMNS
} from '@vidbee/db/subscriptions'
import type { FeedCheckScheduler, FeedCheckSchedulerOptions } from '../../src/scheduler.js'
import type { LeaderElection, LeaderElectionOptions, MetaStore } from '../../src/leader.js'
import type { SubscriptionsApi, SubscriptionsApiOptions } from '../../src/api.js'
import type { FeedFetcher } from '../../src/feed-parser.js'
import type { createSqliteSubscriptionsStore, createSqliteMetaStore } from '../../src/store.js'
import type { LeaderState } from '../../src/types.js'

export const callbackScenarios = [
  'options-capture',
  'normalized-receivers',
  'timer-receivers',
  'receiver-mutation',
  'api-callbacks',
  'global-fetch'
] as const
export type CallbackScenario = typeof callbackScenarios[number]
export interface CallbackBindings {
  FeedCheckScheduler: new (options: FeedCheckSchedulerOptions) => Pick<FeedCheckScheduler, 'start' | 'stop' | 'triggerNow'>
  LeaderElection: new (options: LeaderElectionOptions) => Pick<LeaderElection, 'tryAcquire' | 'release'>
  SubscriptionsApi: new (options: SubscriptionsApiOptions) => Pick<SubscriptionsApi, 'refreshOne' | 'itemsQueue' | 'observeLeader' | 'stop'>
  RssParserFeedFetcher: new () => FeedFetcher
  createSqliteSubscriptionsStore: typeof createSqliteSubscriptionsStore
  createSqliteMetaStore: typeof createSqliteMetaStore
}
type Events = unknown[]
const emptyLeader = (): LeaderState => ({
  kind: null, pid: null, startedAt: null, heartbeatAt: null,
  lockExpiresAt: null, leaseId: null, preferred: null
})
const memoryMeta = (): MetaStore => {
  let state = emptyLeader()
  return {
    async readLeader() { return { ...state } },
    async readPreferred() { return state.preferred },
    async writePreferred(preferred) { state = { ...state, preferred } },
    async casLeader(request) { state = { ...state, ...request.next }; return true }
  }
}
const receiverInterval = (receiver: unknown): unknown =>
  receiver !== null && typeof receiver === 'object' && 'intervalMs' in receiver
    ? receiver.intervalMs ?? 'missing' : 'missing'

const optionsCapture = async (bindings: CallbackBindings): Promise<unknown> => {
  const schedulerEvents: Events = []
  const schedulerOptions: FeedCheckSchedulerOptions = {
    runAll: async () => { schedulerEvents.push('all-original') },
    runOne: async id => { schedulerEvents.push(`one-original:${id}`) },
    isLeader: () => true, setTimeoutImpl: () => 1, clearTimeoutImpl: () => {}
  }
  const scheduler = new bindings.FeedCheckScheduler(schedulerOptions)
  schedulerOptions.runAll = async () => { schedulerEvents.push('all-replacement') }
  schedulerOptions.runOne = async id => { schedulerEvents.push(`one-replacement:${id}`) }
  await scheduler.triggerNow()
  await scheduler.triggerNow('s')
  scheduler.stop()

  const leaderEvents: Events = []
  const originalMeta: MetaStore = {
    async readLeader() { leaderEvents.push('meta-original'); return emptyLeader() },
    async casLeader() { return true }, async readPreferred() { return null }, async writePreferred() {}
  }
  const leaderOptions: LeaderElectionOptions = {
    kind: 'desktop', pid: 1, metaStore: originalMeta,
    onStateChange: () => { leaderEvents.push('sink-original') },
    now: () => 1, scheduleInterval: () => 1, clearInterval: () => {}
  }
  const leader = new bindings.LeaderElection(leaderOptions)
  leaderOptions.metaStore = {
    ...originalMeta,
    async readLeader() { leaderEvents.push('meta-replacement'); return emptyLeader() }
  }
  leaderOptions.onStateChange = () => { leaderEvents.push('sink-replacement') }
  await leader.tryAcquire()
  await leader.release()
  return { scheduler: schedulerEvents, leader: leaderEvents }
}

const normalizedReceivers = async (bindings: CallbackBindings): Promise<unknown> => {
  const schedulerEvents: Events = []
  const scheduler = new bindings.FeedCheckScheduler({
    runAll: async function (this: unknown) { schedulerEvents.push(receiverInterval(this)) },
    runOne: async () => {}, isLeader: () => true,
    setTimeoutImpl: () => 1, clearTimeoutImpl: () => {}
  })
  await scheduler.triggerNow()
  scheduler.stop()
  const leaderEvents: Events = []
  let leader: InstanceType<CallbackBindings['LeaderElection']>
  leader = new bindings.LeaderElection({
    kind: 'desktop', pid: 1, metaStore: memoryMeta(),
    onStateChange: function (this: unknown) { leaderEvents.push(this === leader) },
    now: () => 1, scheduleInterval: () => 1, clearInterval: () => {}
  })
  await leader.tryAcquire()
  await leader.release()
  return { scheduler: schedulerEvents, leader: leaderEvents }
}

const timerReceivers = async (bindings: CallbackBindings): Promise<unknown> => {
  const schedulerEvents: Events = []
  const schedulerSeen = (name: string, receiver: unknown): void => {
    schedulerEvents.push([name, receiverInterval(receiver), receiver === undefined])
  }
  const scheduler = new bindings.FeedCheckScheduler({
    runAll: async () => {}, runOne: async () => {}, isLeader: () => true,
    now: function (this: unknown) { schedulerSeen('now', this); return 1 },
    setTimeoutImpl: function (this: unknown) { schedulerSeen('after', this); return 1 },
    clearTimeoutImpl: function (this: unknown) { schedulerSeen('clearAfter', this) },
    log: function (this: unknown) { schedulerSeen('log', this) }
  })
  scheduler.start()
  await scheduler.triggerNow('id')
  await scheduler.triggerNow('id')
  scheduler.stop()
  const leaderEvents: Events = []
  let leader: InstanceType<CallbackBindings['LeaderElection']>
  const leaderSeen = (name: string, receiver: unknown): void => {
    leaderEvents.push([name, receiver === leader, receiver === undefined])
  }
  leader = new bindings.LeaderElection({
    kind: 'desktop', pid: 1, metaStore: memoryMeta(),
    now: function (this: unknown) { leaderSeen('now', this); return 1 },
    scheduleInterval: function (this: unknown) { leaderSeen('every', this); return 1 },
    clearInterval: function (this: unknown) { leaderSeen('clearEvery', this) },
    log: function (this: unknown) { leaderSeen('log', this) }
  })
  await leader.tryAcquire()
  await leader.release()
  return { scheduler: schedulerEvents, leader: leaderEvents }
}

interface MutableSchedulerReceiver {
  intervalMs: number
  runOne: (id: string) => Promise<void>
}
const receiverMutation = async (bindings: CallbackBindings): Promise<unknown> => {
  const events: Events = []
  let timer: (() => void) | undefined
  const scheduler = new bindings.FeedCheckScheduler({
    runAll: async function (this: MutableSchedulerReceiver) {
      this.intervalMs = 7
      this.runOne = async id => { events.push(`mutated-one:${id}`) }
      events.push('mutated-interval')
    },
    runOne: async id => { events.push(`original-one:${id}`) }, isLeader: () => true,
    setTimeoutImpl: (callback, ms) => { timer = callback; events.push(['schedule', ms]); return 1 },
    clearTimeoutImpl: () => {}
  })
  await scheduler.triggerNow()
  await scheduler.triggerNow('s')
  scheduler.start(123)
  if (timer === undefined) throw new Error('Scheduler did not install the fake timer')
  timer()
  // Drain detached Promise continuations; no elapsed-time value is observed.
  await new Promise<void>(resolve => setImmediate(resolve))
  scheduler.stop()
  return events
}

const baseInput = {
  sourceUrl: 'https://fixture.invalid/source', feedUrl: 'https://fixture.invalid/feed', platform: 'custom'
} as const
const apiCallbacks = async (bindings: CallbackBindings, mutate: boolean): Promise<unknown> => {
  const handle = new Database(':memory:')
  handle.exec(SUBSCRIPTIONS_DDL_V1)
  handle.exec(SUBSCRIPTIONS_DDL_V2)
  for (const [name, definition] of SUBSCRIPTIONS_V3_COLUMNS) {
    handle.exec(`ALTER TABLE subscriptions ADD COLUMN ${name} ${definition}`)
  }
  for (const name of ['download_type', 'download_quality', 'download_container']) {
    handle.exec(`ALTER TABLE subscriptions ADD COLUMN ${name} TEXT`)
  }
  const db = drizzle({ client: handle })
  let id = 0
  const store = bindings.createSqliteSubscriptionsStore({ db, now: () => 100, generateId: () => `sub-${++id}` })
  const meta = bindings.createSqliteMetaStore({ db, now: () => 100 })
  const events: Events = []
  let owner: InstanceType<CallbackBindings['SubscriptionsApi']> | undefined
  try {
    await store.add({ ...baseInput, onlyDownloadLatest: false })
    const fetcher: FeedFetcher = {
      async fetch(this: unknown) {
        events.push(['fetch', this === fetcher])
        return { items: [{ guid: 'i', title: 'Item', link: 'https://fixture.invalid/i', isoDate: '2020-01-01T00:00:00.000Z' }] }
      }
    }
    const options: SubscriptionsApiOptions = {
      kind: 'desktop', pid: 1, store, metaStore: meta, fetcher,
      enqueueItem: async function (this: unknown) {
        events.push(['enqueue-original', this === owner]); throw new Error('admission')
      },
      isHistoryDup: function (this: unknown) {
        events.push(['history-original', this === owner, this === undefined]); return false
      },
      taskExists: function (this: unknown) { events.push(['task-original', this === owner]); return true },
      now: function (this: unknown) { events.push(['now', this === owner]); return 1000 },
      log: function (this: unknown, _level, message) { events.push(['log', message, this === owner]) }
    }
    owner = new bindings.SubscriptionsApi(options)
    if (mutate) {
      options.fetcher = { async fetch() { events.push(['fetch-replacement']); return { items: [] } } }
      options.enqueueItem = async () => { events.push(['enqueue-replacement']); return null }
      options.isHistoryDup = () => { events.push(['history-replacement']); return false }
      options.taskExists = () => { events.push(['task-replacement']); return true }
      options.metaStore = {
        ...meta, async readLeader() { events.push(['meta-replacement']); return emptyLeader() }
      }
    }
    await owner.refreshOne('sub-1')
    await store.markItemQueued('sub-1', 'i', 'task')
    await owner.itemsQueue({ subscriptionId: 'sub-1', itemId: 'i' })
    await owner.observeLeader()
    await owner.stop()
    return events
  } finally {
    releaseHandle(handle)
    handle.close()
  }
}

const globalFetch = async (bindings: CallbackBindings): Promise<unknown> => {
  const original = globalThis.fetch
  const events: Events = []
  try {
    globalThis.fetch = async function (this: unknown) {
      events.push({ global: this === globalThis, undefined: this === undefined })
      return new Response('<rss version="2.0"><channel><title>Feed</title><link>https://example.invalid</link><description>Feed</description></channel></rss>', { status: 200 })
    }
    await new bindings.RssParserFeedFetcher().fetch('https://example.invalid/feed')
    return events
  } finally {
    globalThis.fetch = original
  }
}

export const runCallbackScenario = async (name: CallbackScenario, bindings: CallbackBindings): Promise<unknown> => {
  switch (name) {
    case 'options-capture': return optionsCapture(bindings)
    case 'normalized-receivers': return normalizedReceivers(bindings)
    case 'timer-receivers': return timerReceivers(bindings)
    case 'receiver-mutation': return receiverMutation(bindings)
    case 'api-callbacks': return { receivers: await apiCallbacks(bindings, false), capture: await apiCallbacks(bindings, true) }
    case 'global-fetch': return globalFetch(bindings)
  }
}
