// Complete acceptance and decoded-value oracle, generated against pre-port zod exports.
import * as schemas from '@vidbee/subscriptions-core/schemas'
import { rule, encode } from './pure-oracle'

const item = {id: 'item', url: 'https://fixture.invalid/item', title: 'Item', publishedAt: 100, addedToQueue: false, thumbnail: 'image', taskId: 'task'}
const fullRule = {...rule, coverUrl: 'cover', latestVideoTitle: 'latest', latestVideoPublishedAt: 100, lastCheckedAt: 100, lastSuccessAt: 100, lastError: 'error', downloadDirectory: '/fixture/downloads', namingTemplate: '%(title)s', checkIntervalMs: 1800000, nextCheckAt: 200, downloadType: 'video', downloadQuality: 'best', downloadContainer: 'auto'}
const preferences = {downloadType: 'video', downloadQuality: 'best', downloadContainer: 'auto'}
const create = {...preferences, sourceUrl: 'source', feedUrl: 'feed', platform: 'custom', title: '', keywords: [''], tags: ['tag'], onlyDownloadLatest: false, autoDownload: false, enabled: false, downloadDirectory: '', namingTemplate: '', sourceKind: 'feed', profileOwner: '', categories: ['posts'], checkIntervalMs: 1800000}
const update = {...preferences, title: '', sourceUrl: '', feedUrl: '', platform: 'custom', keywords: [''], tags: [], onlyDownloadLatest: false, autoDownload: false, enabled: false, downloadDirectory: '', namingTemplate: '', categories: ['posts'], checkIntervalMs: null}
const valid: Record<string, unknown> = {
 SubscriptionPlatformSchema: 'custom', SubscriptionSourceKindSchema: 'feed', SubscriptionStatusSchema: 'idle', LeaderKindSchema: 'desktop',
 ResolvedFeedSchema: {sourceUrl: 'source', feedUrl: 'feed', platform: 'custom', sourceKind: 'feed', profileOwner: '', availableCategories: ['unknown']},
 SubscriptionRuleSchema: fullRule, SubscriptionFeedItemSchema: item, SubscriptionWithItemsSchema: {...fullRule, items: [item]},
 SubscriptionCreateInputSchema: create, SubscriptionUpdateInputSchema: update,
 SubscriptionIdInputSchema: {id: 'id'}, ResolveInputSchema: {rawUrl: 'url'}, RefreshInputSchema: {id: 'id'},
 ItemsListInputSchema: {subscriptionId: 'id', limit: 500, offset: 0}, ItemsQueueInputSchema: {subscriptionId: 'id', itemId: 'item'},
 SubscriptionListOutputSchema: {items: [{...fullRule, items: [item]}], total: 1}, SubscriptionItemsListOutputSchema: {items: [item], total: 1},
 ItemsQueueOutputSchema: {queued: false, taskId: null}, VoidOutputSchema: {},
 LeaderStateSchema: {kind: null, pid: null, startedAt: null, heartbeatAt: null, lockExpiresAt: null, leaseId: null, preferred: null}
}
const substitutions = [undefined, null, false, true, 0, -1, 1, 1.5, 1800000, 604800000, 604800001, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity, '', ' ', 'text', [], ['posts'], ['Posts'], ['a--b'], ['a1'], ['a-'], ['-a'], Array.from({length: 17}, () => 'posts'), {}, {extra: true}]
export function schemaCases() {
 const cases: {name: string; schema: string; input: unknown}[] = []
 for (const [schema, sample] of Object.entries(valid)) {
  cases.push({name: `${schema}:valid`, schema, input: sample})
  for (const [index, input] of substitutions.entries()) cases.push({name: `${schema}:root:${index}`, schema, input})
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
   cases.push({name: `${schema}:unknown`, schema, input: {...sample, unknown: {nested: true}}})
   for (const key of Object.keys(sample)) {
    const missing = {...sample}; Reflect.deleteProperty(missing, key)
    cases.push({name: `${schema}:${key}:missing`, schema, input: missing})
    for (const [index, value] of substitutions.entries()) cases.push({name: `${schema}:${key}:${index}`, schema, input: {...sample, [key]: value}})
   }
  }
 }
 // All literal members and neighbors, including downstream download preference schemas.
 const literals = ['youtube','bilibili','custom','instagram','threads','x','tiktok','snapchat','feed','profile','idle','checking','up-to-date','failed','rate-limited','auth-required','desktop','api','video','audio','subtitles','best','good','normal','bad','worst','original','2160p','1440p','1080p','720p','480p','360p','auto','mp4','mkv','webm','mp3','m4a']
 for (const schema of ['SubscriptionPlatformSchema','SubscriptionSourceKindSchema','SubscriptionStatusSchema','LeaderKindSchema']) for (const input of literals) cases.push({name: `${schema}:literal:${input}`, schema, input})
 for (const field of ['downloadType','downloadQuality','downloadContainer']) for (const value of literals) for (const schema of ['SubscriptionCreateInputSchema','SubscriptionUpdateInputSchema','SubscriptionRuleSchema']) cases.push({name: `${schema}:${field}:literal:${value}`, schema, input: {...(schema === 'SubscriptionRuleSchema' ? fullRule : schema === 'SubscriptionCreateInputSchema' ? create : update), [field]: value}})
 for (const input of [{...fullRule, items: [{...item, unknown: 1}], unknown: 2}, {...fullRule, items: [null]}, {...fullRule, items: [{...item, publishedAt: NaN}]}]) cases.push({name: `nested:${cases.length}`, schema: 'SubscriptionWithItemsSchema', input})
 for (const field of ['limit','offset']) for (const value of [0,1,499,500,501,-1,0.5,NaN,Infinity]) cases.push({name: `pagination:${field}:${String(value)}`, schema: 'ItemsListInputSchema', input: {subscriptionId: 'id', [field]: value}})
 return cases
}
export function observeSchema(entry: {schema: string; input: unknown}): unknown {
 const schema = Reflect.get(schemas, entry.schema)
 const result = schema.safeParse(entry.input)
 return result.success ? {success: true, value: encode(result.data)} : {success: false, issues: encode(result.error.issues)}
}
export const schemaExportNames = Object.keys(schemas).sort()
