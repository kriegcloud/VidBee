import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FeedCheckScheduler } from '../../subscriptions-core/src/scheduler'
import { Watchdog } from '../src/process/watchdog'
import { RetryScheduler } from '../src/scheduler/retry-scheduler'
import { deferred, fakeTimers, turn } from './fixtures'

test('retry stop survives an in-flight failing tick', async () => {
  const timers = fakeTimers()
  const gate = deferred()
  const retry = new RetryScheduler({
    ...timers,
    clock: () => 100,
    onDue: async () => {
      await gate.promise
      throw new Error('fixture failure')
    }
  })
  retry.enqueue('one', 100)
  const tick = retry.tick()
  retry.stop()
  gate.resolve()
  await tick
  assert.equal(timers.pending.size, 0)
  assert.equal(retry.size(), 0)
})

test('retry ticks coalesce while callbacks are pending', async () => {
  const timers = fakeTimers()
  const gate = deferred()
  const calls: string[] = []
  const retry = new RetryScheduler({
    ...timers,
    clock: () => 100,
    onDue: async (id) => {
      calls.push(id)
      await gate.promise
    }
  })
  retry.enqueue('one', 100)
  retry.enqueue('two', 100)
  const first = retry.tick()
  const second = retry.tick()
  assert.deepEqual(calls, ['one'])
  gate.resolve()
  await Promise.all([first, second])
  retry.stop()
  assert.deepEqual(calls, ['one', 'two'])
})

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

test('watchdog coalesces progress bursts and expires at the last activity deadline', () => {
  const timers = fakeTimers()
  let now = 0
  const stalled: string[] = []
  const watchdog = new Watchdog((id) => stalled.push(id), {
    ...timers,
    clock: () => now,
    runningIdleMs: 100,
    processingIdleMs: 1000
  })
  watchdog.arm('one', 'running')
  for (let i = 0; i < 10_000; i++) {
    now = 50
    watchdog.bump('one')
  }
  assert.equal(timers.created, 1)
  now = 100
  timers.fire()
  assert.deepEqual(stalled, [])
  assert.equal(timers.pending.values().next().value?.ms, 50)
  now = 150
  timers.fire()
  assert.deepEqual(stalled, ['one'])
})

test('watchdog clears zero-valued handles and honors processing grace', () => {
  const timers = fakeTimers()
  let now = 0
  let stalled = 0
  const watchdog = new Watchdog(
    () => {
      stalled++
    },
    { ...timers, clock: () => now, runningIdleMs: 100, processingIdleMs: 1000 }
  )
  watchdog.arm('one', 'running')
  watchdog.disarm('one')
  assert.equal(timers.pending.size, 0)
  watchdog.arm('one', 'running')
  now = 50
  watchdog.promoteToProcessing('one')
  assert.equal(timers.pending.size, 1)
  assert.equal(timers.pending.values().next().value?.ms, 1000)
  now = 1050
  timers.fire()
  assert.equal(stalled, 1)
})
