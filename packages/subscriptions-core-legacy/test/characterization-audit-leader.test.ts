import { expect, it, vi } from '@effect/vitest'
import { LeaderElection } from '@vidbee/subscriptions-core-legacy/leader'
import { InMemoryMetaStore } from '@vidbee/subscriptions-core-legacy/store'
import { FeedCheckScheduler } from '@vidbee/subscriptions-core-legacy/scheduler'
import { buildSubscriptionDownloadOptions } from '@vidbee/subscriptions-core-legacy/download-options'
vi.setConfig({ testTimeout: 120000 })
it('heartbeat default/custom period and CAS payload retain lease identity and original startedAt', async () => {
  for (const custom of [false, true]) {
    let now = 10
    const periods: number[] = []
    const logs: unknown[][] = []
    const meta = new InMemoryMetaStore()
    const election = new LeaderElection({ metaStore: meta, kind: 'desktop', pid: 1, now: () => now, ...(custom ? { heartbeatIntervalMs: 7, lockTtlMs: 100 } : {}), scheduleInterval: (_cb, ms) => { periods.push(ms); return 1 }, clearInterval: () => undefined, log: (...args) => logs.push(args) })
    const acquired = await election.tryAcquire()
    expect(periods).toEqual([custom ? 7 : 30000])
    expect(logs).toEqual([['info', 'leader: acquired lease', { kind: 'desktop', pid: 1, leaseId: acquired.state.leaseId }]])
    now = 40
    await election.heartbeat()
    expect(await meta.readLeader()).toEqual({ ...acquired.state, startedAt: 10, heartbeatAt: 40, lockExpiresAt: 40 + (custom ? 100 : 90000) })
    await meta.casLeader({ expectedLeaseId: acquired.state.leaseId, now, next: { kind: 'api', pid: 2, startedAt: 40, heartbeatAt: 40, lockExpiresAt: 999, leaseId: 'stolen' } })
    await election.heartbeat()
    expect(logs[1]).toEqual(['warn', 'leader: heartbeat CAS failed; lease was stolen', { kind: 'desktop', pid: 1 }])
    await election.release()
  }
})
it('scheduler not-leader warning preserves all arguments', async () => {
  const logs: unknown[][] = []
  let tick: (() => void) | undefined
  const scheduler = new FeedCheckScheduler({ setTimeoutImpl: (callback) => { tick = callback; return 1 }, clearTimeoutImpl: () => undefined, runOne: async () => undefined, runAll: async () => { throw new Error('must not run') }, isLeader: () => false, log: (...args) => logs.push(args) })
  scheduler.start(); tick?.(); scheduler.stop()
  expect(logs).toEqual([['info', 'scheduler: skipping tick (not leader)']])
})
it('stored unknown/empty/null download preferences and defaults retain nullish precedence', () => {
  const observations: unknown[] = []
  for (const downloadType of ['', 'future-type', null]) for (const downloadContainer of ['future', null]) for (const defaults of [{}, { oneClickDownloadType: '', oneClickQuality: null, oneClickContainer: 'future' }]) {
    const input = { downloadType, downloadContainer }
    observations.push([input, defaults, Reflect.apply(buildSubscriptionDownloadOptions, undefined, [input, defaults])])
  }
  expect(observations).toMatchSnapshot()
})
