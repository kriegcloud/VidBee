import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applySubscriptionsMigrations } from '@vidbee/db/subscriptions'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SubscriptionsApi } from '../src/api'
import { buildFeedKey, resolveFeedFromInput } from '../src/feed-resolver'
import {
  decideProfileDownloads,
  isSubscriptionDue,
  nextProfileCheckAt,
  summarizeProfileStatus
} from '../src/profile-policy'
import { createSqliteSubscriptionsStore, InMemoryMetaStore } from '../src/store'
import type { ProfileCheckResult, SubscriptionFeedItem, SubscriptionRule } from '../src/types'
import { profileItemCategory } from '../src/types'

const HOUR = 60 * 60 * 1000

const rule = (overrides: Partial<SubscriptionRule> = {}): SubscriptionRule => ({
  id: 'sub',
  title: 'Account',
  sourceUrl: 'https://x.com/someone',
  feedUrl: 'vidbee-profile://x/someone',
  platform: 'x',
  keywords: [],
  tags: [],
  onlyDownloadLatest: false,
  autoDownload: true,
  enabled: true,
  status: 'idle',
  createdAt: 0,
  updatedAt: 0,
  sourceKind: 'profile',
  profileOwner: 'someone',
  categories: ['posts-with-media', 'media'],
  ...overrides
})

const known = (id: string, url: string, publishedAt = 1): SubscriptionFeedItem => ({
  id,
  url,
  title: id,
  publishedAt,
  addedToQueue: false
})

test('profile URLs resolve to a synthetic per-account feed with the platform catalog', () => {
  const cases: [string, string, string, string[]][] = [
    [
      'https://www.instagram.com/SydTheBabee/reels/',
      'instagram',
      'sydthebabee',
      ['stories', 'highlights', 'posts', 'reels', 'tagged']
    ],
    ['https://www.threads.com/@someone/media', 'threads', 'someone', ['media']],
    ['x.com/sydthebabee90/media', 'x', 'sydthebabee90', ['posts-with-media', 'media']],
    ['https://www.tiktok.com/@syddbabee', 'tiktok', 'syddbabee', ['stories', 'posts']],
    ['https://www.snapchat.com/@sydluv31', 'snapchat', 'sydluv31', ['stories', 'spotlight']],
    ['https://snapchat.com/add/SydLuv31', 'snapchat', 'sydluv31', ['stories', 'spotlight']]
  ]
  for (const [input, platform, owner, categories] of cases) {
    const resolved = resolveFeedFromInput(input)
    assert.equal(resolved.platform, platform, input)
    assert.equal(resolved.sourceKind, 'profile', input)
    assert.equal(resolved.profileOwner?.toLowerCase(), owner, input)
    assert.deepEqual(resolved.availableCategories, categories, input)
    assert.ok(resolved.feedUrl.startsWith('vidbee-profile://'), input)
  }
  // Two aliases of one account collide on the duplicate-feed key.
  assert.equal(
    buildFeedKey(resolveFeedFromInput('https://www.snapchat.com/@sydluv31').feedUrl),
    buildFeedKey(resolveFeedFromInput('https://snapchat.com/add/SYDLUV31').feedUrl)
  )
})

test('RSS inputs still resolve as feeds', () => {
  const youtube = resolveFeedFromInput('https://www.youtube.com/@handle')
  assert.equal(youtube.sourceKind, 'feed')
  assert.equal(youtube.platform, 'youtube')
  assert.deepEqual(youtube.availableCategories, [])
  assert.equal(resolveFeedFromInput('https://example.com/feed.xml').platform, 'custom')
  // A single post is not a subscribable account.
  assert.equal(resolveFeedFromInput('https://x.com/someone/status/1234567890').sourceKind, 'feed')
})

test('the first profile check queues the whole backlog once per URL', () => {
  const result: ProfileCheckResult = {
    categoryErrors: {},
    items: [
      { id: '10', category: 'media', url: 'https://x.com/i/web/status/10', publishedAt: 10 },
      {
        id: '10',
        category: 'posts-with-media',
        url: 'https://x.com/i/web/status/10',
        publishedAt: 10
      },
      { id: '11', category: 'posts-with-media', url: 'https://x.com/i/web/status/11' },
      { id: '12', category: 'likes', url: 'https://x.com/i/web/status/12' }
    ]
  }
  const decision = decideProfileDownloads({
    subscription: rule(),
    knownItems: [],
    result,
    now: () => 500
  })
  // Unfollowed category dropped; the same post in two categories is kept twice
  // in history but queued once.
  assert.deepEqual(decision.itemsToPersist.map((item) => item.id).sort(), [
    'media:10',
    'posts-with-media:10',
    'posts-with-media:11'
  ])
  assert.deepEqual(
    decision.items.map((item) => item.url),
    ['https://x.com/i/web/status/11', 'https://x.com/i/web/status/10']
  )
  // Undated items take discovery time.
  assert.equal(
    decision.itemsToPersist.find((item) => item.id === 'posts-with-media:11')?.publishedAt,
    500
  )
})

test('later checks only queue unseen items and skip history duplicates', () => {
  const result: ProfileCheckResult = {
    categoryErrors: {},
    items: [
      { id: '1', category: 'media', url: 'https://x.com/i/web/status/1' },
      { id: '2', category: 'media', url: 'https://x.com/i/web/status/2' },
      { id: '3', category: 'media', url: 'https://x.com/i/web/status/3' },
      // Seen before under the other category.
      { id: '4', category: 'media', url: 'https://x.com/i/web/status/4' }
    ]
  }
  const decision = decideProfileDownloads({
    subscription: rule(),
    knownItems: [
      known('media:1', 'https://x.com/i/web/status/1', 7),
      known('posts-with-media:4', 'https://x.com/i/web/status/4')
    ],
    result,
    isHistoryDup: (url) => url.endsWith('/2'),
    now: () => 900
  })
  assert.deepEqual(
    decision.items.map((item) => item.url),
    ['https://x.com/i/web/status/3']
  )
  // Known undated item keeps its first-seen time.
  assert.equal(decision.itemsToPersist.find((item) => item.id === 'media:1')?.publishedAt, 7)
  assert.equal(
    decideProfileDownloads({
      subscription: rule({ autoDownload: false }),
      knownItems: [],
      result
    }).items.length,
    0
  )
})

test('a new version of a known highlight is queued again despite history', () => {
  const sub = rule({ platform: 'instagram', categories: ['highlights', 'posts'] })
  const url = 'https://www.instagram.com/stories/highlights/1789/'
  const result: ProfileCheckResult = {
    categoryErrors: {},
    items: [
      { id: `${url}#v2`, category: 'highlights', url, versioned: true },
      { id: `${url}#v1`, category: 'highlights', url, versioned: true }
    ]
  }
  const decision = decideProfileDownloads({
    subscription: sub,
    knownItems: [known(`highlights:${url}#v1`, url)],
    result,
    isHistoryDup: () => true
  })
  assert.deepEqual(
    decision.items.map((item) => item.id),
    [`highlights:${url}#v2`]
  )
  // An unversioned post whose URL is in history stays skipped.
  assert.equal(
    decideProfileDownloads({
      subscription: sub,
      knownItems: [],
      result: {
        categoryErrors: {},
        items: [{ id: 'p', category: 'posts', url: 'https://www.instagram.com/p/x/' }]
      },
      isHistoryDup: () => true
    }).items.length,
    0
  )
})

test('due checks honor nextCheckAt, the interval override and disabled rows', () => {
  assert.equal(isSubscriptionDue(rule(), 0), true)
  assert.equal(isSubscriptionDue(rule({ lastCheckedAt: 0 }), 2 * HOUR), false)
  assert.equal(isSubscriptionDue(rule({ lastCheckedAt: 0 }), 3 * HOUR), true)
  assert.equal(isSubscriptionDue(rule({ lastCheckedAt: 0, checkIntervalMs: HOUR }), HOUR), true)
  assert.equal(
    isSubscriptionDue(rule({ lastCheckedAt: 0, nextCheckAt: 5 * HOUR }), 4 * HOUR),
    false
  )
  assert.equal(isSubscriptionDue(rule({ enabled: false }), 0), false)
})

test('next profile check uses the retry hint or a jittered interval', () => {
  assert.equal(nextProfileCheckAt(rule(), 0, 20 * 60 * 1000), 20 * 60 * 1000)
  assert.equal(
    nextProfileCheckAt(rule({ checkIntervalMs: HOUR }), 0, undefined, () => 0.5),
    HOUR
  )
  assert.equal(
    nextProfileCheckAt(rule({ checkIntervalMs: HOUR }), 0, undefined, () => 0),
    0.9 * HOUR
  )
})

test('the worst failed category decides the status', () => {
  const sub = rule({ platform: 'instagram', categories: ['stories', 'posts'] })
  const status = (categoryErrors: ProfileCheckResult['categoryErrors']) =>
    summarizeProfileStatus(sub, { items: [], categoryErrors })
  assert.equal(status({}), 'up-to-date')
  assert.equal(status({ posts: 'error' }), 'failed')
  assert.equal(status({ posts: 'error', stories: 'auth-required' }), 'auth-required')
  assert.equal(status({ posts: 'rate-limited', stories: 'auth-required' }), 'rate-limited')
  // Errors in categories the subscription does not follow are ignored.
  assert.equal(status({ reels: 'error' }), 'up-to-date')
})

test('profile item ids carry their category', () => {
  assert.equal(profileItemCategory('x', 'media:123'), 'media')
  assert.equal(profileItemCategory('instagram', 'tagged:https://www.instagram.com/p/x/'), 'tagged')
  assert.equal(profileItemCategory('custom', 'https://example.com/post'), undefined)
  assert.equal(profileItemCategory('x', 'https://x.com/a'), undefined)
})

const openStore = () => {
  const sqlite = new Database(':memory:')
  // A V2 database: no profile columns yet.
  applySubscriptionsMigrations((sql) => sqlite.exec(sql), [])
  sqlite.exec('ALTER TABLE subscriptions DROP COLUMN source_kind')
  const columns = () =>
    (sqlite.prepare('PRAGMA table_info(subscriptions)').all() as { name: string }[]).map(
      (column) => column.name
    )
  applySubscriptionsMigrations((sql) => sqlite.exec(sql), columns())
  assert.ok(columns().includes('source_kind'))
  let clock = 1000
  const now = () => clock
  const store = createSqliteSubscriptionsStore({ db: drizzle(sqlite), now })
  return { store, now, advance: (ms: number) => (clock += ms) }
}

test('profile subscriptions check through the fetcher, merge history and re-plan', async () => {
  const { store, now, advance } = openStore()
  let mapped: ProfileCheckResult = {
    title: 'Some One',
    categoryErrors: {},
    items: [
      {
        id: 'a',
        category: 'stories',
        url: 'https://www.snapchat.com/@someone/stories?vidbee_snap=aaaaaaaaaa'
      },
      {
        id: 'b',
        category: 'spotlight',
        url: 'https://www.snapchat.com/@someone/spotlight/bbbbbbbbbbbbbbbbbbbbbb'
      }
    ]
  }
  const queued: string[] = []
  const api = new SubscriptionsApi({
    kind: 'desktop',
    pid: 1,
    store,
    metaStore: new InMemoryMetaStore(),
    fetcher: { fetch: () => Promise.reject(new Error('feeds are not used here')) },
    profileFetcher: { fetch: () => Promise.resolve(mapped) },
    enqueueItem: ({ item }) => {
      queued.push(item.url)
      return Promise.resolve(`task-${queued.length}`)
    },
    now
  })
  const resolved = resolveFeedFromInput('https://www.snapchat.com/@someone')
  const created = await api.add({ ...resolved, checkIntervalMs: HOUR })
  assert.equal(created.sourceKind, 'profile')
  assert.deepEqual(created.categories, ['stories', 'spotlight'])
  assert.equal(created.onlyDownloadLatest, false)
  await assert.rejects(api.add({ ...resolved }), /SUBSCRIPTION_DUPLICATE_FEED_URL/)

  await api.refreshOne(created.id)
  let current = await api.get({ id: created.id })
  assert.equal(current.status, 'up-to-date')
  assert.equal(current.title, 'Some One')
  assert.equal(queued.length, 2)
  assert.ok(current.items.every((item) => item.addedToQueue))
  assert.ok(current.nextCheckAt !== undefined && current.nextCheckAt > now())

  // The story expired and spotlight is rate-limited: nothing re-queues and the
  // expired story stays in the seen-history.
  advance(HOUR * 2)
  mapped = {
    categoryErrors: { spotlight: 'rate-limited' },
    retryAfter: now() + 15 * 60 * 1000,
    error: 'Snapchat is limiting requests',
    items: [
      {
        id: 'c',
        category: 'stories',
        url: 'https://www.snapchat.com/@someone/stories?vidbee_snap=cccccccccc'
      }
    ]
  }
  await api.refreshOne(created.id)
  current = await api.get({ id: created.id })
  assert.equal(current.status, 'rate-limited')
  assert.equal(current.nextCheckAt, now() + 15 * 60 * 1000)
  assert.deepEqual(queued.slice(2), [
    'https://www.snapchat.com/@someone/stories?vidbee_snap=cccccccccc'
  ])
  assert.deepEqual(current.items.map((item) => item.id).sort(), [
    'spotlight:b',
    'stories:a',
    'stories:c'
  ])

  // Editing the categories clears the retry plan and rejects unknown ones.
  const edited = await api.update({ id: created.id, categories: ['spotlight', 'bogus'] })
  assert.deepEqual(edited.categories, ['spotlight'])
  assert.equal(edited.nextCheckAt, undefined)
  await assert.rejects(
    api.update({ id: created.id, categories: ['bogus'] }),
    /at least one category/
  )
  const cleared = await api.update({ id: created.id, checkIntervalMs: null })
  assert.equal(cleared.checkIntervalMs, undefined)
})

test('hosts without a profile fetcher never touch profile subscriptions', async () => {
  const { store, now } = openStore()
  const desktop = new SubscriptionsApi({
    kind: 'desktop',
    pid: 1,
    store,
    metaStore: new InMemoryMetaStore(),
    fetcher: { fetch: () => Promise.reject(new Error('unused')) },
    profileFetcher: { fetch: () => Promise.reject(new Error('unused')) },
    enqueueItem: () => Promise.resolve(null),
    now
  })
  const api = new SubscriptionsApi({
    kind: 'api',
    pid: 1,
    store,
    metaStore: new InMemoryMetaStore(),
    fetcher: { fetch: () => Promise.reject(new Error('unused')) },
    enqueueItem: () => Promise.resolve(null),
    now
  })
  await assert.rejects(
    api.add(resolveFeedFromInput('https://www.threads.com/@someone')),
    /SUBSCRIPTION_PROFILE_DESKTOP_ONLY/
  )
  // A subscription Desktop created in the shared database stays untouched here.
  const created = await desktop.add(resolveFeedFromInput('https://www.threads.com/@someone'))
  await api.refreshOne(created.id)
  await api.refreshAll()
  const current = await api.get({ id: created.id })
  assert.equal(current.status, 'idle')
  assert.equal(current.lastCheckedAt, undefined)
})
