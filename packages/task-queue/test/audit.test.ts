import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TaskQueueAPI } from '../src/api'
import { virtualError } from '../src/classifier'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '../src/executor'
import { MemoryPersistAdapter } from '../src/persist/memory'
import { EMPTY_PROGRESS } from '../src/types'
import { fakeTimers, task, turn } from './fixtures'

const finish = (ctx: ExecutorContext, type: 'success' | 'error'): ExecutorFinishEvent => ({
  taskId: ctx.taskId,
  attemptId: ctx.attemptId,
  closedAt: 10,
  stdoutTail: '',
  stderrTail: '',
  result:
    type === 'success'
      ? {
          type,
          output: {
            filePath: '/fixture.mp4',
            size: 10,
            durationMs: null,
            sha256: null,
            formatId: null
          }
        }
      : { type, error: virtualError('binary-missing', 'fixture'), exitCode: 1 }
})

test('repeated postprocessing progress does not fail a download', async (t) => {
  const runs: { ctx: ExecutorContext; events: ExecutorEvents }[] = []
  const timers = fakeTimers()
  const queue = new TaskQueueAPI({
    persist: new MemoryPersistAdapter(),
    ...timers,
    filePresent: () => true,
    executor: {
      run(ctx, events) {
        runs.push({ ctx, events })
        return { cancel: async () => {}, pause: async () => {} }
      }
    }
  })
  await queue.start()
  t.after(() => queue.stop())
  const { id } = await queue.add({ input: { kind: 'video', url: 'https://example.com/a' } })
  const first = runs[0]
  assert.ok(first)
  const { ctx, events } = first
  for (let ticks = 1; ticks <= 3; ticks++) {
    events.onProgress({ ...ctx, progress: { ...EMPTY_PROGRESS, ticks }, enteredProcessing: true })
    await turn()
  }
  assert.equal(queue.get(id)?.status, 'processing')
  events.onFinish(finish(ctx, 'success'))
  await turn()
  assert.equal(queue.get(id)?.status, 'completed')
})

test('synchronously finished executors leave no active handle', async () => {
  let cancelled = 0
  const queue = new TaskQueueAPI({
    persist: new MemoryPersistAdapter(),
    ...fakeTimers(),
    executor: {
      run(ctx, events) {
        events.onFinish(finish(ctx, 'error'))
        return {
          cancel: async () => {
            cancelled++
          },
          pause: async () => {}
        }
      }
    }
  })
  await queue.start()
  const { id } = await queue.add({ input: { kind: 'video', url: 'https://example.com/a' } })
  await turn()
  assert.equal(queue.get(id)?.status, 'failed')
  await queue.stop()
  assert.equal(cancelled, 0)
})

test('old attempt callbacks cannot change or release a retried task', async (t) => {
  const runs: { ctx: ExecutorContext; events: ExecutorEvents }[] = []
  const queue = new TaskQueueAPI({
    persist: new MemoryPersistAdapter(),
    ...fakeTimers(),
    executor: {
      run(ctx, events) {
        runs.push({ ctx, events })
        return { cancel: async () => {}, pause: async () => {} }
      }
    }
  })
  await queue.start()
  t.after(() => queue.stop())
  const { id } = await queue.add({ input: { kind: 'video', url: 'https://example.com/a' } })
  const first = runs[0]
  assert.ok(first)
  first.events.onFinish(finish(first.ctx, 'error'))
  await turn()
  await queue.retryManual(id)
  first.events.onProgress({
    ...first.ctx,
    progress: { ...EMPTY_PROGRESS, ticks: 999 },
    enteredProcessing: true
  })
  first.events.onFinish(finish(first.ctx, 'error'))
  await turn()
  assert.equal(queue.get(id)?.status, 'running')
  assert.equal(queue.get(id)?.progress.ticks, 0)
  assert.equal(queue.stats().running, 1)
})

test('removing a parent removes every child beyond the first 1000', async (t) => {
  const persist = new MemoryPersistAdapter()
  await persist.insertTask(task('parent'))
  for (let i = 0; i < 1005; i++) {
    await persist.insertTask(task(`child-${i}`, { parentId: 'parent' }))
  }
  const queue = new TaskQueueAPI({
    persist,
    ...fakeTimers(),
    executor: {
      run() {
        throw new Error('No runnable tasks')
      }
    }
  })
  await queue.start()
  t.after(() => queue.stop())
  await queue.removeFromHistory('parent')
  assert.equal(queue.stats().total, 0)
  assert.equal((await persist.loadAllTasks()).length, 0)
})

test('failed durable deletion keeps history visible', async (t) => {
  const persist = new MemoryPersistAdapter()
  await persist.insertTask(task('parent'))
  await persist.insertTask(task('child', { parentId: 'parent' }))
  persist.deleteTask = async () => {
    throw new Error('Disk failure')
  }
  const queue = new TaskQueueAPI({
    persist,
    ...fakeTimers(),
    executor: {
      run() {
        throw new Error('No runnable tasks')
      }
    }
  })
  await queue.start()
  t.after(() => queue.stop())
  await assert.rejects(queue.removeFromHistory('parent'), /Disk failure/)
  assert.equal(queue.stats().total, 2)
  assert.ok(queue.get('child'))
})

for (const synchronous of [true, false]) {
  test(`watchdog cancellation waits for finish before retry (synchronous=${synchronous})`, async (t) => {
    let now = 0
    const timers = fakeTimers()
    const runs: { ctx: ExecutorContext; events: ExecutorEvents }[] = []
    const queue = new TaskQueueAPI({
      persist: new MemoryPersistAdapter(),
      ...timers,
      idleQueueKickMs: 0,
      runningIdleMs: 100,
      clock: () => now,
      rng: () => 0,
      executor: {
        run(ctx, events) {
          runs.push({ ctx, events })
          events.onSpawn({ ...ctx, pid: -1, pidStartedAt: null, kind: 'yt-dlp', spawnedAt: now })
          return {
            cancel: async () => {
              if (synchronous) {
                events.onFinish({ ...finish(ctx, 'error'), result: { type: 'cancelled' } })
              }
            },
            pause: async () => {}
          }
        }
      }
    })
    await queue.start()
    t.after(() => queue.stop())
    const { id } = await queue.add({ input: { kind: 'video', url: 'https://example.com/a' } })
    now = 100
    timers.fire()
    await turn()
    const first = runs[0]
    assert.ok(first)
    if (!synchronous) {
      assert.equal(queue.get(id)?.status, 'running')
      assert.equal(queue.stats().running, 1)
      first.events.onFinish({ ...finish(first.ctx, 'error'), result: { type: 'cancelled' } })
      await turn()
    }
    assert.equal(queue.get(id)?.status, 'retry-scheduled')
    assert.equal(queue.get(id)?.lastError?.category, 'stalled')
    const nextRetryAt = queue.get(id)?.nextRetryAt
    assert.ok(nextRetryAt != null)
    now = nextRetryAt
    timers.fire()
    await turn()
    assert.equal(runs.length, 2)
    first.events.onFinish(finish(first.ctx, 'error'))
    await turn()
    assert.equal(queue.get(id)?.status, 'running')
    assert.equal(queue.stats().running, 1)
  })
}

test('history deletion waits for active descendants and releases their group slots', async (t) => {
  const persist = new MemoryPersistAdapter()
  await persist.insertTask(task('parent'))
  const runs: { ctx: ExecutorContext; events: ExecutorEvents }[] = []
  const queue = new TaskQueueAPI({
    persist,
    ...fakeTimers(),
    defaultMaxPerGroup: 1,
    executor: {
      run(ctx, events) {
        runs.push({ ctx, events })
        return { cancel: async () => {}, pause: async () => {} }
      }
    }
  })
  await queue.start()
  t.after(() => queue.stop())
  const child = await queue.add({
    parentId: 'parent',
    input: { kind: 'video', url: 'https://example.com/a' }
  })
  let removed = false
  const removal = queue.removeFromHistory('parent').then(() => {
    removed = true
  })
  await turn()
  assert.equal(removed, false)
  assert.equal(queue.get(child.id)?.status, 'cancelled')
  const first = runs[0]
  assert.ok(first)
  first.events.onFinish({ ...finish(first.ctx, 'error'), result: { type: 'cancelled' } })
  await removal
  assert.equal(queue.stats().total, 0)
  assert.equal(queue.stats().running, 0)
  await queue.add({ input: { kind: 'video', url: 'https://example.com/b' } })
  assert.equal(runs.length, 2)
})
