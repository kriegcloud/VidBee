import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TaskQueueAPI } from '../src/api'
import { MemoryPersistAdapter } from '../src/persist/memory'
import { Scheduler } from '../src/scheduler/scheduler'
import { SourceAdmission } from '../src/source-admission'
import type { Task } from '../src/types'
import { fakeTimers, task } from './fixtures'

test('concurrent duplicate downloads wait for persistence and start only once', async (t) => {
  let releaseInsert = () => {}
  const inserted = new Promise<void>((resolve) => {
    releaseInsert = resolve
  })
  class DelayedPersist extends MemoryPersistAdapter {
    override async insertTask(value: Task): Promise<void> {
      await inserted
      await super.insertTask(value)
    }
  }
  let started = 0
  const queue = new TaskQueueAPI({
    persist: new DelayedPersist(),
    ...fakeTimers(),
    executor: {
      run() {
        started++
        return { cancel: async () => {}, pause: async () => {} }
      }
    }
  })
  await queue.start()
  t.after(() => queue.stop())
  const first = queue.add({ input: { kind: 'video', url: 'https://youtu.be/example' } })
  let duplicateSettled = false
  const second = queue
    .add({ input: { kind: 'video', url: 'https://www.youtube.com/watch?v=example' } })
    .then((result) => {
      duplicateSettled = true
      return result
    })
  await Promise.resolve()
  assert.equal(duplicateSettled, false)
  assert.equal(started, 0)
  releaseInsert()
  assert.deepEqual(await first, await second)
  assert.equal(started, 1)
  await assert.rejects(
    queue.add({
      parentId: 'removed-parent',
      input: { kind: 'video', url: 'https://youtu.be/example' }
    }),
    /missing or being removed/
  )
})

test('sweeping dead slots releases platform admission and preserves live group counts', async () => {
  const admission = new SourceAdmission()
  const tasks = new Map([
    [
      'dead',
      task('dead', {
        groupKey: 'instagram',
        input: { kind: 'video', url: 'https://instagram.com/p/one/' }
      })
    ],
    [
      'live',
      task('live', { groupKey: 'youtube', input: { kind: 'video', url: 'https://youtu.be/two' } })
    ]
  ])
  const scheduler = new Scheduler({
    admission,
    maxConcurrency: 2,
    getTask: (id) => tasks.get(id),
    dispatch: () => true,
    demote: () => {}
  })
  await scheduler.enqueue('dead', 0)
  await scheduler.enqueue('live', 0)
  assert.equal(admission.tryAcquire('https://instagram.com/p/three/'), null)
  tasks.delete('dead')
  await scheduler.sweepDeadSlots((id) => id === 'live')
  assert.deepEqual(scheduler.stats().perGroup, { youtube: 1 })
  const release = admission.tryAcquire('https://instagram.com/p/three/')
  assert.ok(release)
  release()
  await scheduler.releaseSlot('live')
})

test('ASR waits for download capacity while source admission still serializes downloads', async () => {
  const tasks = new Map([
    ['first', task('first', { input: { kind: 'video', url: 'https://instagram.com/p/one/' } })],
    ['second', task('second', { input: { kind: 'video', url: 'https://instagram.com/p/two/' } })],
    ['asr', task('asr', { kind: 'transcription', groupKey: 'transcription' })]
  ])
  const dispatched: string[] = []
  const scheduler = new Scheduler({
    admission: new SourceAdmission(),
    maxConcurrency: 3,
    getTask: (id) => tasks.get(id),
    dispatch: (id) => {
      dispatched.push(id)
      return true
    },
    demote: () => {}
  })
  await scheduler.setMaxConcurrentDownloads(1)
  await scheduler.enqueue('first', 0)
  await scheduler.enqueue('second', 0)
  await scheduler.enqueue('asr', 1)
  assert.deepEqual(dispatched, ['first'])
  await scheduler.releaseSlot('first')
  assert.deepEqual(dispatched, ['first', 'second'])
  await scheduler.releaseSlot('second')
  assert.deepEqual(dispatched, ['first', 'second', 'asr'])
  await scheduler.releaseSlot('asr')
})
