import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as root from '@vidbee/subscriptions-core-legacy'
import * as form from '@vidbee/subscriptions-core-legacy/form'
import * as feedItems from '@vidbee/subscriptions-core-legacy/feed-items'
import * as downloadOptions from '@vidbee/subscriptions-core-legacy/download-options'
import { observe, pureCases } from './fixtures/pure-oracle'

const frozen: Record<string, unknown> = JSON.parse(readFileSync(new URL('./fixtures/pure-oracle.json', import.meta.url), 'utf8'))
describe('pre-port pure differential oracle', () => {
 for (const entry of pureCases()) it(entry.name, () => {
  const expected = frozen[entry.name]
  expect(expected, 'case must exist in frozen oracle').toBeDefined()
  if (entry.engine && expected && typeof expected === 'object' && 'error' in expected) {
   expect(expected).toHaveProperty('engine', true)
   expect(() => entry.run()).toThrow()
  } else expect(observe(entry)).toEqual(expected)
 }, 30000)
 it('keeps root aliases identical and subpath-only functions absent', () => {
  expect(root.sanitizeCommaList).toBe(form.sanitizeCommaList)
  expect(root.normalizeFeedItems).toBe(feedItems.normalizeFeedItems)
  expect(root.getSubscriptionStatusMeta('failed', false)).toBe(root.disabledStatusMeta)
  expect(root.getSubscriptionStatusMeta('unknown', true)).toBe(root.getSubscriptionStatusMeta('idle', true))
  expect('getSubscriptionFeedEntries' in root).toBe(false)
  expect('buildSubscriptionDownloadOptions' in root).toBe(false)
  expect('discoverFeedUrls' in root).toBe(false)
  expect('LIST_PROFILE_ITEM_LIMIT' in root).toBe(false)
  expect(typeof downloadOptions.buildSubscriptionDownloadOptions).toBe('function')
 })
})

// Zone-less Date.parse belongs to the host runtime; select both Node and TZ.
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {NODE} from './fixtures/node-runtime'
import {normalizeFeedItems} from '@vidbee/subscriptions-core-legacy/feed-items'
import {decideAutoDownloads} from '@vidbee/subscriptions-core-legacy/auto-download'
import {nextProfileCheckAt, decideProfileDownloads} from '@vidbee/subscriptions-core-legacy/profile-policy'
import {rule} from './fixtures/pure-oracle'
const dates: Record<string, unknown> = JSON.parse(readFileSync(new URL('./fixtures/date-oracle.json', import.meta.url), 'utf8'))
for (const TZ of ['UTC', 'Asia/Tokyo', 'America/New_York']) it(`pinned Node date coercion and DST (${TZ})`, () => {
 const observed = JSON.parse(execFileSync(NODE, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/date-oracle.ts', import.meta.url))], {encoding: 'utf8', env: {...process.env, TZ}, timeout: 60000, killSignal: 'SIGKILL'}))
 expect(observed).toEqual(dates[TZ])
}, 30000)
it('policy and normalization callback failures escape synchronously by identity', () => {
 const reason = new Error('callback fixture')
 const fail = () => {throw reason}
 const item = {guid: 'a', title: 'A', link: 'url'}
 const calls = [
  () => normalizeFeedItems([item], {now: fail}),
  () => decideAutoDownloads({subscription: rule, knownItems: [], feed: {items: [item]}, now: () => 100, isHistoryDup: fail}),
  () => decideProfileDownloads({subscription: rule, knownItems: [], result: {items: [], categoryErrors: {}}, now: fail}),
  () => decideProfileDownloads({subscription: rule, knownItems: [], result: {items: [{id: 'a', category: 'posts', url: 'url'}], categoryErrors: {}}, now: () => 100, isHistoryDup: fail})
 ]
 for (const call of calls) {let caught: unknown; try {call()} catch (error) {caught = error} expect(caught).toBe(reason)}
})

it('legacy wrappers preserve default wall-clock and random sampling', () => {
 const clock = vi.spyOn(Date, 'now').mockReturnValue(123)
 const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
 const raw = {guid: 'a', title: 'A', link: 'url'}
 const normalized = {id: 'a', title: 'A', url: 'url', publishedAt: 123, thumbnail: undefined}
 try {
  expect(normalizeFeedItems([raw, {...raw, guid: 'b'}])).toEqual([normalized, {...normalized, id: 'b'}])
  expect(clock).toHaveBeenCalledTimes(2)
  clock.mockClear()
  expect(decideAutoDownloads({subscription: rule, knownItems: [], feed: {items: [raw]}})).toEqual({subscription: rule, items: [normalized], feedItemsToPersist: [normalized], latestPublishedAt: 123, latestVideoTitle: 'A'})
  expect(clock).toHaveBeenCalledTimes(1)
  clock.mockClear()
  const profileItem = {id: 'posts:a', title: '@owner · posts · a', url: 'url', publishedAt: 123}
  expect(decideProfileDownloads({subscription: rule, knownItems: [], result: {items: [{id: 'a', category: 'posts', url: 'url'}], categoryErrors: {}}})).toEqual({items: [profileItem], itemsToPersist: [profileItem], latest: profileItem})
  expect(clock).toHaveBeenCalledTimes(1)
  expect(nextProfileCheckAt(rule, 100)).toBe(10800100)
  expect(random).toHaveBeenCalledTimes(1)
  expect(nextProfileCheckAt(rule, 100, 101)).toBe(101)
  expect(random).toHaveBeenCalledTimes(1)
 } finally { clock.mockRestore(); random.mockRestore() }
})
