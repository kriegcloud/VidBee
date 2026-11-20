// Frozen pre-port oracle inputs. Public package entries only; clocks are synthetic.
import * as form from '@vidbee/subscriptions-core-legacy/form'
import * as status from '@vidbee/subscriptions-core-legacy/status'
import * as resolver from '@vidbee/subscriptions-core-legacy/feed-resolver'
import * as items from '@vidbee/subscriptions-core-legacy/feed-items'
import * as policy from '@vidbee/subscriptions-core-legacy/profile-policy'
import * as auto from '@vidbee/subscriptions-core-legacy/auto-download'
import * as downloads from '@vidbee/subscriptions-core-legacy/download-options'
import * as types from '@vidbee/subscriptions-core-legacy/types'
import type { SubscriptionRule } from '@vidbee/subscriptions-core-legacy/types'

export const rule: SubscriptionRule = {
 id: 'subscription', title: 'Fixture', sourceUrl: 'https://fixture.invalid/source',
 feedUrl: 'https://fixture.invalid/feed', platform: 'instagram', keywords: [], tags: [],
 onlyDownloadLatest: false, autoDownload: true, enabled: true, status: 'idle',
 createdAt: 100, updatedAt: 100, sourceKind: 'profile', profileOwner: 'owner', categories: ['posts', 'reels']
}
export function encode(value: unknown): unknown {
 if (value === undefined) return { $value: 'undefined' }
 if (typeof value === 'number' && !Number.isFinite(value)) return { $value: String(value) }
 if (typeof value === 'function') return { $value: 'function', name: value.name }
 if (Array.isArray(value)) return value.map(encode)
 if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child)]))
 return value
}
export interface OracleCase { name: string; run: () => unknown; engine?: boolean }
export function observe(entry: OracleCase): unknown {
 try { return { value: encode(entry.run()) } }
 catch (error) { return { error: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error), engine: entry.engine === true } }
}
export function pureCases(): OracleCase[] {
 const cases: OracleCase[] = []
 const add = (name: string, run: () => unknown, engine = false) => cases.push({ name: `${cases.length}:${name}`, run, engine })
 const call = (name: string, fn: Function, args: unknown[]) => add(`${name}:${JSON.stringify(encode(args))}`, () => Reflect.apply(fn, undefined, args), true)
 const scalars = [undefined, null, false, true, 0, 7, NaN, '', ' ', 'text']
 for (const [name, fn] of Object.entries(form).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) for (const value of [...scalars, ' a, b,a,A,, b ', 'C:\\Videos\\', '/a//b/', '/', '\\\\server\\share']) call(name, fn, [value])
 const urls = ['', ' ', 'youtube.com/channel/UC_123/videos', 'https://evil.invalid/youtube.com/channel/UC_123', 'youtube.com/user/a%20b', 'youtube.com/c/Foo', 'youtube.com/@Mixed', 'https://youtube.com/feeds/videos.xml?channel_id=abc', 'bilibili.com/space/123', 'space.bilibili.com/123', 'bilibili.com/user/123', 'rsshub.app/bilibili/user/video/123', 'https://EXAMPLE.com/A/?b=2&a=1#fragment', 'http://example.com/A?b=2&a=1', 'example.com/a', 'not a url', 'vidbee-profile://instagram/MiXeD', 'instagram.com/SomeOne/reels/', 'threads.net/@SomeOne/media', 'x.com/SomeOne/media', 'twitter.com/SomeOne', 'tiktok.com/@SomeOne', 'snapchat.com/@SomeOne/spotlight', 'https://user:pass@example.com/feed', 'ftp://example.com/feed']
 for (const url of [...urls, ...scalars.filter(value => typeof value !== 'string')]) for (const [name, fn] of Object.entries(resolver).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).filter(([name]) => name !== 'profileFeedUrl')) call(name, fn, [url])
 for (const platform of types.PROFILE_PLATFORMS) for (const owner of ['', 'Mixed Case', 'é/@?#']) call('profileFeedUrl', resolver.profileFeedUrl, [platform, owner])
 add('catalog and constants', () => Object.fromEntries(Object.entries(types).filter(([, value]) => typeof value !== 'function')))
 for (const platform of [...types.PROFILE_PLATFORMS, 'custom', 'constructor', '', null]) {
 call('isProfilePlatform', types.isProfilePlatform, [platform])
 for (const id of ['posts:1', 'reels:1:2', 'stories:', 'media:1', 'posts-with-media:1', 'spotlight:1', ':1', 'posts', '']) call('profileItemCategory', types.profileItemCategory, [platform, id])
 }
 for (const category of ['', 'posts', 'a:b']) for (const id of ['', 'x:y', 'é']) call('profileItemId', types.profileItemId, [category, id])
 for (const enabled of [false, true]) for (const name of ['idle', 'checking', 'up-to-date', 'failed', 'rate-limited', 'auth-required', 'unknown', '', 'constructor', 'toString', '__proto__', undefined]) call('getSubscriptionStatusMeta', status.getSubscriptionStatusMeta, [name, enabled])
 for (const addedToQueue of [true, false]) for (const taskId of [undefined, '', 'task', 'missing']) for (const downloadId of [undefined, 'download']) for (const state of ['pending', 'downloading', 'processing', 'completed', 'cancelled', 'failed', 'error', 'idle', 'unknown', '']) add(`queue:${addedToQueue}:${taskId}:${downloadId}:${state}`, () => status.resolveSubscriptionItemStatus({ addedToQueue, taskId, downloadId }, new Map([['task', { status: state }], ['download', { status: 'completed' }]])))
 for (const downloadType of [undefined, 'video', 'audio', 'subtitles'] as const) for (const downloadQuality of [undefined, 'best', 'good', 'normal', 'bad', 'worst', '1080p'] as const) for (const downloadContainer of [undefined, 'auto', 'mp4', 'mkv', 'webm', 'original'] as const) for (const defaults of [{}, { oneClickDownloadType: 'audio', oneClickQuality: 'good', oneClickContainer: 'mkv' }] as const) call('download options', downloads.buildSubscriptionDownloadOptions, [{downloadType, downloadQuality, downloadContainer}, defaults])
 const art = [{}, {itunes: {image: ' itunes '}}, {itunes: {image: {href: ' href ', url: ' url '}}}, {itunes: {image: {href: '', url: ' url '}}}, {mediaThumbnail: [{}, {url: 'thumb'}]}, {mediaThumbnail: {url: ''}}, {enclosure: [{url: 'audio', type: 'audio/mp3'}, {url: 'enclosure', type: 'image/jpeg'}]}, {mediaContent: [{url: 'media'}]}, ...['content', 'contentEncoded', 'description', 'summary', 'contentSnippet'].flatMap(key => ['<img src="image">', "<IMG data-src='lazy'>", '<img data-original=original>', '<img srcset="one 1x, two 2x">', '<img src="">', 'no image'].map(value => ({[key]: value}))) ]
 for (const [index, item] of art.entries()) call('thumbnail', items.resolveThumbnail, [item])
 for (const [i, item] of art.entries()) call('thumbnail precedence', items.resolveThumbnail, [{...item, itunes: {image: ' primary '}, mediaThumbnail: {url: 'secondary'}, content: '<img src="last">'}])
 for (const image of [undefined, '', ' ', 'cover']) for (const itunes of [undefined, '', 'itunes']) for (const normalized of [[], [{id: 'n', url: 'url', title: 'title', publishedAt: 1, thumbnail: 'normalized'}]]) call('cover', items.resolveFeedCover, [{image: {url: image}, itunes: {image: itunes}}, normalized, [{mediaThumbnail: {url: 'raw'}}]])
 const raw = {guid: ' id ', link: 'url', title: 'Title'}
 for (const field of ['youtubeId', 'guid', 'id', 'link', 'title', 'content', 'mediaThumbnail', 'enclosure', 'itunes']) for (const value of scalars) call('normalize boundary', items.normalizeFeedItems, [[{...raw, [field]: value}], {now: () => 12345}])
 for (const isoDate of [undefined, '', 'invalid', '2020-01-01T00:00:00Z', '2020-01-02T03:04:05+09:00']) for (const pubDate of [undefined, 'invalid', 'Tue, 01 Jan 2019 00:00:00 GMT']) call('date precedence', items.normalizeFeedItems, [[{...raw, isoDate, pubDate}], {now: () => 12345}])
 add('normalize clock and stable order', () => { let calls = 0; const value = items.normalizeFeedItems([{...raw, guid: 'a'}, {...raw, guid: 'b'}, {...raw, guid: ' '}, {...raw, guid: 'c', isoDate: 'bad'}, {...raw, guid: 'd', pubDate: '2020-01-01T00:00:00Z'}], {now: () => { calls++; return 10 }}); return {value, calls} })
 add('dedupe identity and first winner', () => { const first = {id: 'a', extra: 1}; const second = {id: 'b', extra: 2}; const result = items.dedupeFeedItems([first, second, {id: 'a', extra: 3}]); return {result, firstIdentity: result[0] === first, secondIdentity: result[1] === second} })
 add('timeline identity stable ties and no mutation', () => { const a = {id: 'a', items: [{id: 'a1', url: 'u', title: 't', publishedAt: 2, addedToQueue: false}, {id: 'a2', url: 'u', title: 't', publishedAt: 1, addedToQueue: false}]}; const b = {id: 'b', items: [{id: 'b1', url: 'u', title: 't', publishedAt: 2, addedToQueue: true}]}; const result = items.getSubscriptionFeedEntries([a, b, {id: 'empty'}]); return {result, sameSubscription: result[0]?.subscription === a, sameItem: result[0]?.item === a.items[0], sources: [a,b]} })
 for (const checkIntervalMs of [undefined, null, 0, -1, 1800000, 10800000, NaN, Infinity]) for (const enabled of [true, false]) for (const lastCheckedAt of [undefined, 0, 100]) for (const nextCheckAt of [undefined, 0, 100, NaN]) call('due and interval', (s: SubscriptionRule) => ({interval: policy.resolveCheckIntervalMs(s), due: policy.isSubscriptionDue(s, 100)}), [{...rule, checkIntervalMs, enabled, lastCheckedAt, nextCheckAt}])
 for (const retry of [undefined, 0, 100, 101, NaN, Infinity]) for (const random of [0, 0.5, 0.999, 1, -1, NaN]) add(`jitter:${retry}:${random}`, () => { let calls = 0; const value = policy.nextProfileCheckAt(rule, 100, retry, () => { calls++; return random }); return {value, calls} })
 for (const posts of [undefined, 'error', 'auth-required', 'rate-limited', 'unknown']) for (const reels of [undefined, 'error', 'auth-required', 'rate-limited']) call('summary', policy.summarizeProfileStatus, [rule, {items: [], categoryErrors: {posts, reels, ignored: 'rate-limited'}, error: 'top level alone'}])
 const feed = {title: 'Feed', image: {url: 'cover'}, items: [
 {guid: 'new', link: 'new', title: 'Match New', isoDate: '2020-01-03T00:00:00Z'},
 {guid: 'new', link: 'duplicate', title: 'Match Duplicate', isoDate: '2020-01-02T00:00:00Z'},
 {guid: 'old', link: 'old', title: 'Other Old', isoDate: '2020-01-01T00:00:00Z'}]}
 for (const onlyDownloadLatest of [false, true]) for (const autoDownload of [false, true]) for (const keywords of [[], ['match'], ['missing'], ['']]) for (const knownItems of [[], [{id: 'old', url: 'old', title: 'known', publishedAt: Date.parse('2020-01-01T00:00:00Z'), addedToQueue: false}]]) for (const latestVideoPublishedAt of [undefined, 0, Date.parse('2020-01-03T00:00:00Z'), NaN]) for (const history of [false, true]) add(`rss policy:${JSON.stringify(encode([onlyDownloadLatest, autoDownload, keywords, knownItems, latestVideoPublishedAt, history]))}`, () => { const trace: string[] = []; const subscription = {...rule, onlyDownloadLatest, autoDownload, keywords, latestVideoPublishedAt}; const decision = auto.decideAutoDownloads({subscription, knownItems, feed, now: () => 123, isHistoryDup: url => {trace.push(url); return history}}); return {decision, trace, subscriptionIdentity: decision.subscription === subscription} })
 const profileItems = [ {id: '1', category: 'posts', url: 'same', title: '  Custom  '}, {id: '2', category: 'reels', url: 'same'}, {id: '1', category: 'posts', url: 'duplicate', publishedAt: 200}, {id: '3', category: 'ignored', url: 'ignored'}, {id: '4', category: 'posts', url: 'version', title: ' ', versioned: true, thumbnail: 'thumb'} ]
 for (const autoDownload of [true, false]) for (const onlyDownloadLatest of [true, false]) for (const knownCategory of [undefined, 'posts', 'reels', 'invalid']) for (const history of [false, true]) add(`profile policy:${autoDownload}:${onlyDownloadLatest}:${knownCategory}:${history}`, () => { const trace: string[] = []; let calls = 0; const knownItems = knownCategory ? [{id: knownCategory + ':old', url: 'version', title: 'old', publishedAt: 1, addedToQueue: false}, {id: 'posts:1', url: 'same', title: 'old', publishedAt: 2, addedToQueue: true}] : []; const decision = policy.decideProfileDownloads({subscription: {...rule, autoDownload, onlyDownloadLatest}, knownItems, result: {items: profileItems, categoryErrors: {}}, now: () => {calls++; return 100}, isHistoryDup: url => {trace.push(url); return history}}); return {decision, trace, calls} })
 for (const field of ['id', 'category', 'url', 'title', 'publishedAt', 'thumbnail', 'versioned']) for (const value of scalars) call('profile item boundary', policy.decideProfileDownloads, [{subscription: rule, knownItems: [], result: {items: [{id: '1', category: 'posts', url: 'url', [field]: value}], categoryErrors: {}}, now: () => 100}])
 for (const value of scalars) call('RSS feed items boundary', auto.decideAutoDownloads, [{subscription: rule, knownItems: [], feed: {items: value}, now: () => 100}])
 for (const id of ['youtubeId', 'guid', 'id']) call('preferred identity precedence', items.normalizeFeedItems, [[{...raw, youtubeId: 'youtube', guid: 'guid', id: 'id', [id]: '   '}], {now: () => 100}])
 add('RSS duplicate URLs remain distinct IDs', () => auto.decideAutoDownloads({subscription: rule, knownItems: [], feed: {items: [{guid: 'a', link: 'same', title: 'A'}, {guid: 'b', link: 'same', title: 'B'}]}, now: () => 100}))
 add('profile empty result still samples clock once', () => { let calls = 0; const result = policy.decideProfileDownloads({subscription: rule, knownItems: [], result: {items: [], categoryErrors: {}}, now: () => {calls++; return 100}}); return {result, calls} })
 return cases
}
