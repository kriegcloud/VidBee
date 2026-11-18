import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'

test('admission legacy callback identity deduplicates and old unsubscribe removes a re-registration', () => {
  const admission = new SourceAdmission()
  let calls = 0
  const listener = () => { calls++ }
  const first = admission.subscribe(listener)
  const second = admission.subscribe(listener)
  admission.tryAcquire('https://example.com/first')?.()
  assert.equal(calls, 1)
  first()
  const third = admission.subscribe(listener)
  second()
  admission.tryAcquire('https://example.com/second')?.()
  assert.equal(calls, 1)
  third()
})

test('reentrant add sees insert adapter synchronous prefix before pending admission is published', async () => {
  const { TaskQueueAPI, MemoryPersistAdapter } = await import('@vidbee/task-queue-legacy')
  const { deferred, turn } = await import('./fixtures.js')
  const persist = new MemoryPersistAdapter()
  const insert = persist.insertTask.bind(persist)
  const writeGate = deferred()
  let queue: InstanceType<typeof TaskQueueAPI>
  let reentrantSettled = false
  let reentrant: Promise<{ id: string }> | undefined
  persist.insertTask = async (task) => {
    reentrant = queue.add({ id: task.id, input: task.input })
    void reentrant.then(() => { reentrantSettled = true })
    await writeGate.promise
    await insert(task)
  }
  queue = new TaskQueueAPI({
    persist,
    idleQueueKickMs: 0,
    executor: { run: () => ({ cancel: async () => {}, pause: async () => {} }) }
  })
  await queue.start()
  const outer = queue.add({ id: 'reentrant-admission', input: { kind: 'video', url: 'https://example.com/reentrant' } })
  await turn()
  assert.equal(reentrantSettled, true)
  assert.equal(await persist.hasTask('reentrant-admission'), false)
  writeGate.resolve()
  assert.deepEqual(await outer, { id: 'reentrant-admission' })
  assert.deepEqual(await reentrant, { id: 'reentrant-admission' })
  await queue.stop()
})
