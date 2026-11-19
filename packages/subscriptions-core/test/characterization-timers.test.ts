import { expect, it, vi } from 'vitest'
import { FeedCheckScheduler } from '@vidbee/subscriptions-core/scheduler'
import { LeaderElection, type MetaStore } from '@vidbee/subscriptions-core/leader'
import { InMemoryMetaStore } from '@vidbee/subscriptions-core/store'
import type { LeaderState } from '@vidbee/subscriptions-core/types'
import { deferred, turns } from './fixtures/api-host'

vi.setConfig({ testTimeout: 120000 })

it('scheduler handles zero timers, replaces start, generations stop rearming, one-ID bypasses lease', async () => {
  const trace: unknown[] = []; const callbacks: (() => void)[] = []
  const gate = deferred<void>(); let clock = 100
  const scheduler = new FeedCheckScheduler({ runAll() { trace.push('all'); return gate.promise }, async runOne(id) { trace.push(['one', id]) }, isLeader: () => true, intervalMs: 9, now: () => clock,
    setTimeoutImpl(cb, ms) { callbacks.push(cb); trace.push(['schedule', callbacks.length - 1, ms]); return callbacks.length - 1 }, clearTimeoutImpl: (handle) => trace.push(['clear', handle]), log: (level, message, metadata) => trace.push(['log', level, message, metadata]) })
  expect(scheduler.start()).toBeUndefined(); scheduler.start(5)
  callbacks[1]?.(); await turns(); scheduler.stop(); scheduler.start(2)
  gate.resolve(); await turns(); scheduler.stop()
  await scheduler.triggerNow('id'); await scheduler.triggerNow('id'); clock += 30000; await scheduler.triggerNow('id')
  expect(trace).toMatchSnapshot()
})
it('scheduler slow all-work coalesces pending rerun, captures runAll rejection and rearms', async () => {
  const trace: unknown[] = []; const callbacks: (() => void)[] = []; const gate = deferred<void>(); let runs = 0
  const scheduler = new FeedCheckScheduler({ runAll() { trace.push(['all', ++runs]); return runs === 1 ? gate.promise : Promise.reject(new Error('run-failure')) }, async runOne() {}, isLeader: () => true,
    setTimeoutImpl(cb, ms) { trace.push(['schedule', ms]); callbacks.push(cb); return callbacks.length }, clearTimeoutImpl: (handle) => trace.push(['clear', handle]), log: (level, msg, metadata) => trace.push(['log', level, msg, metadata]) })
  scheduler.start(); callbacks[0]?.(); const pending = scheduler.triggerNow(); await pending
  trace.push('pending-trigger-settled'); gate.resolve(); await turns(50); scheduler.stop()
  expect(trace).toMatchSnapshot()
})
it('failed single-ID triggers consume dedupe; boundary equality, pruning and backward clock retained', async () => {
  const trace: unknown[] = []; let clock = 0
  const failure = { run: 'failed' }
  const scheduler = new FeedCheckScheduler({ async runAll() { trace.push('all') }, runOne(id) { trace.push(['one', id]); return Promise.reject(failure) }, isLeader: () => false, now: () => clock,
    refreshDedupeWindowMs: 10, log: (level, msg, metadata) => trace.push(['log', level, msg, metadata]) })
  for (clock of [0, 0, -1, 9, 10, 31]) {
    const result = await scheduler.triggerNow('id').then(() => 'fulfilled', (error: unknown) => error)
    trace.push(['result', clock, result])
  }
  await scheduler.triggerNow(); expect(trace).toMatchSnapshot()
})
const empty = (): LeaderState => ({ kind: null, pid: null, startedAt: null, heartbeatAt: null, lockExpiresAt: null, leaseId: null, preferred: null })
for (const expiry of [null, 99, 100, 101]) for (const preferred of [null, 'api', 'desktop'] as const) it(`lease expiration/preference ${expiry}/${preferred}`, async () => {
  const meta = new InMemoryMetaStore()
  await meta.casLeader({ expectedLeaseId: null, now: 0, next: { ...empty(), kind: 'api', pid: 2, leaseId: 'other', lockExpiresAt: expiry } })
  await meta.writePreferred(preferred)
  const trace: unknown[] = []
  const leader = new LeaderElection({ metaStore: meta, kind: 'desktop', pid: 1, now: () => 100, scheduleInterval: (_cb, ms) => { trace.push(['interval', ms]); return 1 }, clearInterval: (handle) => trace.push(['clear', handle]) })
  const result = await leader.tryAcquire()
  const expected = expiry !== null && expiry <= 100 && preferred !== 'api'
  expect(result.acquired).toBe(expected); expect(leader.isLeader()).toBe(expected)
  // Variable entropy is checked structurally; all stored clock and lease relationships stay exact.
  if (expected) { expect(result.state.leaseId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); expect(result.state).toEqual({ kind: 'desktop', pid: 1, startedAt: 100, heartbeatAt: 100, lockExpiresAt: 90100, leaseId: result.state.leaseId, preferred }) }
  else expect(result.state).toEqual({ ...empty(), kind: 'api', pid: 2, leaseId: 'other', lockExpiresAt: expiry, preferred })
  await leader.release()
})
it('fresh reacquire loses local leadership while lease persists; zero heartbeat handle is never cleared', async () => {
  const meta = new InMemoryMetaStore(); const trace: unknown[] = []
  const leader = new LeaderElection({ metaStore: meta, kind: 'desktop', pid: 1, now: () => 50, scheduleInterval: () => 0, clearInterval: (handle) => trace.push(handle), onStateChange: (state, owns) => trace.push([owns, state.kind, state.lockExpiresAt]) })
  const first = await leader.tryAcquire(); const second = await leader.tryAcquire()
  expect(first.acquired).toBe(true); expect(second.acquired).toBe(false); expect(leader.isLeader()).toBe(false)
  expect((await meta.readLeader()).leaseId).toBe(first.state.leaseId)
  await leader.release(); expect(trace).toEqual([[true, 'desktop', 90050], [false, 'desktop', 90050]])
})
it('leader acquisition logger throws after stored/local/timer mutations, before state callback', async () => {
  const meta = new InMemoryMetaStore(); const sentinel = { logger: 'failure' }; const trace: unknown[] = []
  const leader = new LeaderElection({ metaStore: meta, kind: 'desktop', pid: 1, now: () => 4, scheduleInterval: () => { trace.push('scheduled'); return 1 }, clearInterval: () => trace.push('cleared'), log: () => { trace.push(['log', leader.isLeader()]); throw sentinel }, onStateChange: () => trace.push('state') })
  await expect(leader.tryAcquire()).rejects.toBe(sentinel)
  expect(leader.isLeader()).toBe(true); expect((await meta.readLeader()).kind).toBe('desktop'); expect(trace).toEqual(['scheduled', ['log', true]])
  await leader.release(); expect(trace).toEqual(['scheduled', ['log', true], 'cleared', 'state'])
})
it('heartbeat/release CAS failures and callback errors retain exact state mutation order', async () => {
  const memory = new InMemoryMetaStore(); let fail = false; const trace: unknown[] = []
  const meta: MetaStore = { readLeader: () => memory.readLeader(), readPreferred: () => memory.readPreferred(), writePreferred: (kind) => memory.writePreferred(kind), casLeader: (request) => fail ? Promise.resolve(false) : memory.casLeader(request) }
  const leader = new LeaderElection({ metaStore: meta, kind: 'desktop', pid: 1, now: () => 10, scheduleInterval: () => 1, clearInterval: (handle) => trace.push(['clear', handle]), log: (level, message) => trace.push([level, message, leader.isLeader()]), onStateChange: (_state, owns) => trace.push(['state', owns, leader.isLeader()]) })
  expect(await leader.heartbeat()).toBe(false); await leader.tryAcquire(); expect(await leader.heartbeat()).toBe(true)
  fail = true; expect(await leader.heartbeat()).toBe(false); expect(await leader.heartbeat()).toBe(false)
  fail = false; await memory.casLeader({ expectedLeaseId: (await memory.readLeader()).leaseId, now: 10, next: empty() }); await leader.tryAcquire(); fail = true; await leader.release()
  expect(trace).toMatchSnapshot()
})

it('lease ULID uses library wall clock independently of the injected election clock; CAS loss returns fresh state', async () => {
  const { decodeTime } = await import('ulid')
  vi.spyOn(Date, 'now').mockReturnValue(5000)
  try {
    const memory = new InMemoryMetaStore()
    const leader = new LeaderElection({ metaStore: memory, kind: 'desktop', pid: 1, now: () => 10, scheduleInterval: () => 1, clearInterval() {} })
    const acquired = await leader.tryAcquire()
    expect(acquired.state.startedAt).toBe(10)
    expect(decodeTime(acquired.state.leaseId ?? '')).toBe(5000)
    await leader.release()
    const trace: unknown[] = []
    const lost = new LeaderElection({ metaStore: { ...memory, readLeader: () => memory.readLeader(), readPreferred: () => memory.readPreferred(), writePreferred: (kind) => memory.writePreferred(kind), async casLeader() { trace.push('CAS'); return false } }, kind: 'desktop', pid: 1, now: () => 10, scheduleInterval() { throw new Error('must not schedule') }, log: (level, message) => trace.push([level, message]), onStateChange: (state, owns) => trace.push([state, owns]) })
    expect(await lost.tryAcquire()).toEqual({ acquired: false, state: empty() })
    expect(lost.isLeader()).toBe(false)
    expect(trace).toEqual(['CAS', ['info', 'leader: acquire CAS failed; another host is leader'], [empty(), false]])
  } finally { vi.restoreAllMocks() }
})
