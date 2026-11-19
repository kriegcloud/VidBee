import { networkRefusals } from './network.mjs'
import { afterAll } from '@effect/vitest'
import { observations } from './entry-loader.mjs'
afterAll(() => expect(observations.current).toBeGreaterThan(0))
import { beforeEach, afterEach, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { Harness, source, url, now } from './harness.mjs'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => { expect(networkRefusals).toEqual([]); networkRefusals.length = 0; vi.useRealTimers() })

// Closure-only controls cannot all be reached through rendered controls (empty URL guard).
// Extract the original declarations verbatim, keeping strict execution and fake navigation.
function controls(currentUrl, fail = false, old = false) {
  const text = source('entrypoints/popup/App.tsx', old)
  const start = text.indexOf('  const wait =')
  const end = text.indexOf('  const isInvalidPageError')
  const navigation = [], retries = []
  const h = new Harness()
  const location = {}
  Object.defineProperty(location, 'href', { set: uri => { navigation.push(uri); if (fail) throw new Error('Navigation assignment failed') } })
  const api = h.evaluate(`${text.slice(start, end)}\nexport { handleOpenClient, handleOpenClientAndRetry, handleRetry }`, 'controls.tsx', {
    currentUrl, location, setRetryTrigger: update => retries.push(update(0))
  })
  return { api, navigation, retries }
}
it.each([true, false])('side old=%s pins empty-current-URL guard, URI construction, assignment failures and delayed retry continuation', async old => {
  const empty = controls('', false, old); empty.api.handleOpenClient(); expect(empty.navigation).toEqual([])
  const download = controls(url, false, old); download.api.handleOpenClient()
  expect(download.navigation).toEqual([`vidbee://download?url=${encodeURIComponent(url)}`])
  const failure = controls(url, true, old)
  expect(() => failure.api.handleOpenClient()).toThrow('Navigation assignment failed')
  await expect(failure.api.handleOpenClientAndRetry()).rejects.toThrow('Navigation assignment failed')
  expect(failure.retries).toEqual([])
  const launch = controls(url, false, old); const work = launch.api.handleOpenClientAndRetry()
  expect(launch.navigation).toEqual(['vidbee://']); expect(launch.retries).toEqual([])
  launch.api.handleRetry(); expect(launch.retries).toEqual([1])
  await vi.advanceTimersByTimeAsync(2000); await work
  expect(launch.retries).toEqual([1, 1])
})
