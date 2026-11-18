import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FeedCheckScheduler } from '../../subscriptions-core/src/scheduler'
import { deferred, fakeTimers, turn } from './fixtures'
test('feed stop during refresh does not rearm the scheduler', async () => {
  const timers = fakeTimers()
  const gate = deferred()
  const scheduler = new FeedCheckScheduler({
    isLeader: () => true,
    runAll: () => gate.promise,
    runOne: async () => {},
    setTimeoutImpl: timers.setTimer,
    clearTimeoutImpl: timers.clearTimer
  })
  scheduler.start()
  timers.fire()
  scheduler.stop()
  gate.resolve()
  await turn()
  assert.equal(timers.pending.size, 0)
  scheduler.start(123)
  assert.equal(timers.pending.values().next().value?.ms, 123)
  scheduler.stop()
  assert.equal(timers.pending.size, 0)
})

