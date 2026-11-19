import { readFileSync } from 'node:fs'
import { expect, it } from '@effect/vitest'
import { pipe } from 'effect/Function'
import * as S from 'effect/Schema'
import * as Models from '@vidbee/subscriptions-core/Subscription.model'
import { profileItemId, profileItemCategory } from '@vidbee/subscriptions-core/types'
import { profileFeedUrl } from '@vidbee/subscriptions-core/feed-resolver'
import { getSubscriptionStatusMeta, resolveSubscriptionItemStatus } from '@vidbee/subscriptions-core/status'
import { buildSubscriptionDownloadOptions } from '@vidbee/subscriptions-core/download-options'
import { normalizeFeedItems, resolveFeedCover } from '@vidbee/subscriptions-core/feed-items'
import { decideAutoDownloads } from '@vidbee/subscriptions-core/auto-download'
import {
  isSubscriptionDue, nextProfileCheckAt, summarizeProfileStatus, decideProfileDownloads
} from '@vidbee/subscriptions-core/profile-policy'
import { discoverFeedUrls } from '@vidbee/subscriptions-core/feed-parser'
import { encode, materialize } from './fixtures/review-pure-cases.js'

// Reuse the frozen pre-port values. Neither native call form supplies expectations.
const rows = S.decodeUnknownSync(S.Array(S.Struct({
  module: S.String, name: S.String, path: S.String, args: S.Array(S.Unknown),
  expected: S.Record(S.String, S.Unknown)
})))(JSON.parse(readFileSync(new URL('./fixtures/review-pure-oracle.json', import.meta.url), 'utf8')))
const rowFor = (module: string, name: string) => {
  const row = rows.find(row => row.module === module && row.name === name && row.path === 'valid')
  if (row === undefined) throw new Error(`Missing frozen valid oracle: ${module}.${name}`)
  return row
}
const argsFor = <Schema extends S.ConstraintDecoder<unknown, never>>(
  schema: Schema, module: string, name: string
): Schema['Type'] => S.decodeUnknownSync(schema)(materialize(rowFor(module, name).args))
const both = (module: string, name: string, dataFirst: () => unknown, dataLast: () => unknown): void => {
  const expected = rowFor(module, name).expected.value
  expect(encode(dataFirst())).toEqual(expected)
  expect(encode(dataLast())).toEqual(expected)
}
const normalizeOptions = {
  now: () => 123,
  parseDate: (value: unknown): number | null => {
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isNaN(parsed) ? null : parsed
  }
}
const mutableItems = S.mutable(S.Array(Models.SubscriptionFeedItem))

it('native profile item ID supports both declared call forms against the old value', () => {
  const [category, id] = argsFor(S.Tuple([S.String, S.String]), 'types', 'profileItemId')
  both('types', 'profileItemId', () => profileItemId(category, id), () => pipe(category, profileItemId(id)))
}, 10_000)
it('native profile category supports both declared call forms against the old value', () => {
  const [platform, id] = argsFor(S.Tuple([Models.SubscriptionPlatform, S.String]), 'types', 'profileItemCategory')
  both('types', 'profileItemCategory', () => profileItemCategory(platform, id), () => pipe(platform, profileItemCategory(id)))
}, 10_000)
it('native profile feed URL supports both declared call forms against the old value', () => {
  const [platform, owner] = argsFor(S.Tuple([Models.ProfilePlatform, S.String]), 'resolver', 'profileFeedUrl')
  both('resolver', 'profileFeedUrl', () => profileFeedUrl(platform, owner), () => pipe(platform, profileFeedUrl(owner)))
}, 10_000)
it('native status metadata supports both declared call forms against the old value', () => {
  const [status, enabled] = argsFor(S.Tuple([S.String, S.Boolean]), 'status', 'getSubscriptionStatusMeta')
  both('status', 'getSubscriptionStatusMeta', () => getSubscriptionStatusMeta(status, enabled), () => pipe(status, getSubscriptionStatusMeta(enabled)))
}, 10_000)
it('native queue status retains the public ReadonlyMap in both call forms', () => {
  const [item, encodedMap] = S.decodeUnknownSync(S.Tuple([
    S.Struct({ addedToQueue: S.Boolean, downloadId: S.optional(S.String), taskId: S.optional(S.String) }),
    S.Struct({ $map: S.Array(S.Tuple([S.String, S.Struct({ status: S.String })])) })
  ]))(rowFor('status', 'resolveSubscriptionItemStatus').args)
  const downloads: ReadonlyMap<string, { status: string }> = new Map(encodedMap.$map)
  both('status', 'resolveSubscriptionItemStatus', () => resolveSubscriptionItemStatus(item, downloads), () => pipe(item, resolveSubscriptionItemStatus(downloads)))
}, 10_000)
it('native download options support both declared call forms against the old full result', () => {
  const [preferences, defaults] = argsFor(S.Tuple([Models.SubscriptionDownloadPreferences, Models.SubscriptionDownloadDefaults]), 'downloads', 'buildSubscriptionDownloadOptions')
  both('downloads', 'buildSubscriptionDownloadOptions', () => buildSubscriptionDownloadOptions(preferences, defaults), () => pipe(preferences, buildSubscriptionDownloadOptions(defaults)))
}, 10_000)
it('native normalization takes explicit clock and date capabilities in both forms', () => {
  const [items] = argsFor(S.Tuple([S.mutable(S.Array(Models.ParsedFeedItem)), S.Unknown]), 'items', 'normalizeFeedItems')
  both('items', 'normalizeFeedItems', () => normalizeFeedItems(items, normalizeOptions), () => pipe(items, normalizeFeedItems(normalizeOptions)))
}, 10_000)
it('native cover selection supports both declared call forms against the old value', () => {
  const [feed, items, rawItems] = argsFor(S.Tuple([Models.ParsedFeed, S.mutable(S.Array(Models.NormalizedFeedItem)), S.mutable(S.Array(Models.ParsedFeedItem))]), 'items', 'resolveFeedCover')
  both('items', 'resolveFeedCover', () => resolveFeedCover(feed, items, rawItems), () => pipe(feed, resolveFeedCover(items, rawItems)))
}, 10_000)
it('native due calculation supports both declared call forms against the old value', () => {
  const [rule, now] = argsFor(S.Tuple([Models.SubscriptionRule, S.Finite]), 'profile', 'isSubscriptionDue')
  both('profile', 'isSubscriptionDue', () => isSubscriptionDue(rule, now), () => pipe(rule, isSubscriptionDue(now)))
}, 10_000)
it('native next-check calculation takes explicit entropy in both declared forms', () => {
  const [rule, now, retryAfter] = argsFor(S.Tuple([Models.SubscriptionRule, S.Finite, S.Finite, S.Unknown]), 'profile', 'nextProfileCheckAt')
  const random = () => 0.5
  both('profile', 'nextProfileCheckAt', () => nextProfileCheckAt(rule, now, retryAfter, random), () => pipe(rule, nextProfileCheckAt(now, retryAfter, random)))
}, 10_000)
it('native profile summary supports both declared call forms against the old value', () => {
  const [rule, result] = argsFor(S.Tuple([Models.SubscriptionRule, Models.ProfileCheckResult]), 'profile', 'summarizeProfileStatus')
  both('profile', 'summarizeProfileStatus', () => summarizeProfileStatus(rule, result), () => pipe(rule, summarizeProfileStatus(result)))
}, 10_000)
it('native profile policy takes an explicit clock in both forms and retains the old full decision', () => {
  const [input] = argsFor(S.Tuple([S.Struct({ subscription: Models.SubscriptionRule, knownItems: mutableItems, result: Models.ProfileCheckResult })]), 'profile', 'decideProfileDownloads')
  const policyInput = { ...input, isHistoryDup: () => false }
  both('profile', 'decideProfileDownloads', () => decideProfileDownloads(policyInput, normalizeOptions.now), () => pipe(policyInput, decideProfileDownloads(normalizeOptions.now)))
}, 10_000)
it('native RSS policy takes explicit clock/date capabilities and retains the old full decision', () => {
  const [input] = argsFor(S.Tuple([S.Struct({ subscription: Models.SubscriptionRule, knownItems: mutableItems, feed: Models.ParsedFeed })]), 'auto', 'decideAutoDownloads')
  const policyInput = { ...input, isHistoryDup: () => false }
  both('auto', 'decideAutoDownloads', () => decideAutoDownloads(policyInput, normalizeOptions), () => pipe(policyInput, decideAutoDownloads(normalizeOptions)))
}, 10_000)
it('native advertised feed discovery supports both declared forms against the old URLs', () => {
  const [html, pageUrl] = argsFor(S.Tuple([S.String, S.String]), 'feed', 'discoverFeedUrls')
  both('feed', 'discoverFeedUrls', () => discoverFeedUrls(html, pageUrl), () => pipe(html, discoverFeedUrls(pageUrl)))
}, 10_000)
