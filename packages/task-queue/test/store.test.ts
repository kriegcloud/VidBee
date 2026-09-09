import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TaskStore } from '../src/store'
import { task } from './fixtures'

test('cached pages preserve ordering and expose current task fields', () => {
  const store = new TaskStore()
  store.insert(task('c', { createdAt: 2 }))
  store.insert(task('b'))
  store.insert(task('a'))
  const first = store.list({ limit: 1 })
  assert.deepEqual(
    first.tasks.map((t) => t.id),
    ['a']
  )
  const b = store.get('b')
  assert.ok(b)
  store.update({ ...b, input: { kind: 'video', url: 'updated' } })
  const next = store.list({ cursor: first.nextCursor, limit: 1 })
  assert.equal(next.tasks[0]?.id, 'b')
  assert.equal(next.tasks[0]?.input.url, 'updated')
  assert.deepEqual(
    store.list({ cursor: next.nextCursor }).tasks.map((t) => t.id),
    ['c']
  )
})

test('membership and order changes invalidate cached listings', () => {
  const store = new TaskStore()
  store.insert(task('a', { parentId: 'p' }))
  store.insert(task('b', { parentId: 'p' }))
  assert.equal(store.list({ parentId: 'p', status: 'completed' }).tasks.length, 2)
  const a = store.get('a')
  assert.ok(a)
  store.update({ ...a, status: 'failed', parentId: 'q', groupKey: 'new' })
  assert.deepEqual(
    store.list({ parentId: 'p', status: 'completed' }).tasks.map((t) => t.id),
    ['b']
  )
  assert.equal(store.list({ groupKey: 'new', status: 'failed' }).tasks[0]?.id, 'a')
  const updated = store.get('a')
  assert.ok(updated)
  store.update({ ...updated, createdAt: 3 })
  assert.deepEqual(
    store.list().tasks.map((t) => t.id),
    ['b', 'a']
  )
  store.remove('b')
  assert.deepEqual(
    store.list().tasks.map((t) => t.id),
    ['a']
  )
  store.insert(task('c'))
  assert.deepEqual(
    store.list().tasks.map((t) => t.id),
    ['c', 'a']
  )
})
