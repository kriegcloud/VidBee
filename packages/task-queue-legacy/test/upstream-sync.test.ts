import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TaskQueueAPI } from '../src/api'
import { MemoryPersistAdapter } from '../src/persist/memory'
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

