import assert from 'node:assert/strict'
import test from 'node:test'
import { getDownloadQueueProgress } from '../src/lib/download-queue-progress'

test('queue progress includes completed siblings but excludes old unrelated history', () => {
  const progress = getDownloadQueueProgress([
    { id: 'one', entryType: 'history', status: 'completed', batchId: 'current' },
    {
      id: 'two',
      entryType: 'active',
      status: 'downloading',
      batchId: 'current',
      progress: { percent: 50 }
    },
    { id: 'three', entryType: 'active', status: 'pending', batchId: 'current' },
    { id: 'old', entryType: 'history', status: 'completed', batchId: 'old' }
  ])
  assert.deepEqual(progress, { active: 2, finished: 1, total: 3, percent: 50 })
  assert.equal(
    getDownloadQueueProgress([{ id: 'done', entryType: 'history', status: 'completed' }]),
    null
  )
})
