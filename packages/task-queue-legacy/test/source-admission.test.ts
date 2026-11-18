import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SourceAdmission } from '../src/source-admission'
import { task, turn } from './fixtures'

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

