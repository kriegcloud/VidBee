import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scheduler } from '../src/scheduler/scheduler'
import { SourceAdmission } from '../src/source-admission'
import { task, turn } from './fixtures'

test('a map blocks same-platform downloads without consuming unrelated download slots', async () => {
  const admission = new SourceAdmission()
  const releaseMap = await admission.acquire('https://instagram.com/profile/')
  assert.ok(releaseMap)
  const tasks = new Map([
    ['first', task('first', { input: { kind: 'video', url: 'https://www.instagram.com/p/one/' } })],
    [
      'second',
      task('second', { input: { kind: 'video', url: 'https://instagram.com/reel/two/' } })
    ],
    [
      'other',
      task('other', { input: { kind: 'video', url: 'https://www.youtube.com/watch?v=three' } })
    ]
  ])
  const started: string[] = []
  const scheduler = new Scheduler({
    admission,
    maxConcurrency: 2,
    getTask: (id) => tasks.get(id),
    dispatch: (id) => {
      started.push(id)
      return true
    },
    demote: () => {}
  })
  await scheduler.enqueue('first', 0)
  await scheduler.enqueue('second', 0)
  await scheduler.enqueue('other', 0)
  assert.deepEqual(started, ['other'])
  releaseMap()
  await turn()
  assert.deepEqual(started, ['other', 'first'])
  await scheduler.releaseSlot('first')
  assert.deepEqual(started, ['other', 'first', 'second'])
  await scheduler.releaseSlot('second')
  await scheduler.releaseSlot('other')
})

test('maps wait for active downloads and cancellation removes only that waiting request', async () => {
  const admission = new SourceAdmission()
  const releaseDownload = admission.tryAcquire('https://www.instagram.com/p/example/')
  assert.ok(releaseDownload)
  const cancelled = new AbortController()
  const first = admission.acquire('https://instagram.com/first/', cancelled.signal)
  let secondAdmitted = false
  const second = admission.acquire('https://instagram.com/second/').then((release) => {
    secondAdmitted = true
    return release
  })
  cancelled.abort()
  assert.equal(await first, null)
  assert.equal(secondAdmitted, false)
  releaseDownload()
  const releaseSecond = await second
  assert.ok(releaseSecond)
  assert.equal(admission.tryAcquire('https://instagram.com/third/'), null)
  releaseSecond()
  const next = admission.tryAcquire('https://instagram.com/third/')
  assert.ok(next)
  next()
})

test('failed dispatch releases platform admission for following work', async () => {
  const admission = new SourceAdmission()
  const started: string[] = []
  const scheduler = new Scheduler({
    admission,
    maxConcurrency: 2,
    getTask: (id) => task(id),
    dispatch: (id) => {
      started.push(id)
      return id !== 'failed'
    },
    demote: () => {}
  })
  await scheduler.enqueue('failed', 0)
  await scheduler.enqueue('next', 0)
  assert.deepEqual(started, ['failed', 'next'])
  await scheduler.releaseSlot('next')
})
