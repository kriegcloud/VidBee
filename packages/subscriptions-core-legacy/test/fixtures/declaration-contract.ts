// Positive public-declaration fixtures. These functions are checked but never executed.
// Frozen declarations below pin the public surface under legacy optional-property semantics.
import type {SubscriptionCreateInput, SubscriptionUpdateInput, SubscriptionWithItems, ParsedFeedItem, ProfileCheckResult} from '@vidbee/subscriptions-core-legacy/types'
import type {QueueLinkSelector, SubscriptionsStore} from '@vidbee/subscriptions-core-legacy/store'
import type {SubscriptionsApi, EnqueueItem, SubscriptionsApiListener} from '@vidbee/subscriptions-core-legacy/api'
import {getSubscriptionFeedEntries, dedupeFeedItems} from '@vidbee/subscriptions-core-legacy/feed-items'

export const explicitOptionalInputs = (): [SubscriptionCreateInput, SubscriptionUpdateInput] => [
 {sourceUrl: 'source', feedUrl: 'feed', platform: 'custom', title: undefined, keywords: undefined, tags: undefined, onlyDownloadLatest: undefined, autoDownload: undefined, enabled: undefined, sourceKind: undefined, profileOwner: undefined, categories: undefined, checkIntervalMs: undefined, downloadDirectory: undefined, namingTemplate: undefined, downloadType: undefined, downloadQuality: undefined, downloadContainer: undefined},
 {title: undefined, sourceUrl: undefined, feedUrl: undefined, platform: undefined, keywords: undefined, tags: undefined, enabled: undefined, categories: undefined, checkIntervalMs: null, downloadType: undefined, downloadQuality: undefined, downloadContainer: undefined}
]
export const nestedMutations = (subscription: SubscriptionWithItems, parsed: ParsedFeedItem, profile: ProfileCheckResult): void => {
 subscription.keywords.push('keyword')
 subscription.tags[0] = 'tag'
 subscription.categories.push('posts')
 subscription.items.push({id: 'new', url: 'url', title: 'Title', publishedAt: 1, addedToQueue: false, taskId: undefined})
 const first = subscription.items[0]
 if (first) {first.title = 'changed'; first.thumbnail = undefined; first.taskId = undefined}
 parsed.mediaThumbnail = [{url: undefined}]
 if (Array.isArray(parsed.mediaThumbnail)) parsed.mediaThumbnail.push({url: 'image'})
 profile.items.push({id: 'new', category: 'posts', url: 'url', title: undefined})
 profile.categoryErrors.posts = 'error'
}
export const readonlySelectorElementsStayMutable = (selector: QueueLinkSelector): void => {
 const first = selector.items?.[0]
 if (first) {first.subscriptionId = 'changed'; first.itemId = 'changed'}
 selector.items = [{subscriptionId: 'sub', itemId: 'item'}] as const
 selector.taskIds = ['task'] as const
}
export const genericTimelineInference = () => {
 const item = {id: 'item', url: 'url', title: 'Title', publishedAt: 1, addedToQueue: false, extraItem: 42}
 const subscription = {id: 'sub', extraSubscription: 'value', items: [item]}
 const entry = getSubscriptionFeedEntries([subscription])[0]
 if (!entry) return
 const extraItem: number = entry.item.extraItem
 const extraSubscription: string = entry.subscription.extraSubscription
 const deduped = dedupeFeedItems([item])[0]
 const retained: number | undefined = deduped?.extraItem
 return {extraItem, extraSubscription, retained}
}
export const promiseAndCallbackContracts = (api: SubscriptionsApi, store: SubscriptionsStore, listener: SubscriptionsApiListener): void => {
 const unsubscribe: () => void = api.on('changed', listener)
 const list: Promise<SubscriptionWithItems[]> = store.list()
 const get: Promise<SubscriptionWithItems | null> = store.get('sub')
 const clear: Promise<number> = store.clearOrphanedQueueLinks(async () => true)
 const enqueue: EnqueueItem = async (context) => context.item.id ? 'task' : null
 void unsubscribe; void list; void get; void clear; void enqueue
}

import type * as OldTypes from './legacy-declarations/types.js'
import type * as NewTypes from '../../src/types.js'
import type * as OldStore from './legacy-declarations/store.js'
import type * as NewStore from '../../src/store.js'
import type * as OldApi from './legacy-declarations/api.js'
import type * as NewApi from '../../src/api.js'
import type * as OldLeader from './legacy-declarations/leader.js'
import type * as NewLeader from '../../src/leader.js'
import type * as OldScheduler from './legacy-declarations/scheduler.js'
import type * as NewScheduler from '../../src/scheduler.js'
import type * as OldFeedParser from './legacy-declarations/feed-parser.js'
import type * as NewFeedParser from '../../src/feed-parser.js'
import type * as OldFeedItems from './legacy-declarations/feed-items.js'
import type * as NewFeedItems from '../../src/feed-items.js'
import type * as OldAutoDownload from './legacy-declarations/auto-download.js'
import type * as NewAutoDownload from '../../src/auto-download.js'
import type * as OldProfilePolicy from './legacy-declarations/profile-policy.js'
import type * as NewProfilePolicy from '../../src/profile-policy.js'
import type * as OldStatus from './legacy-declarations/status.js'
import type * as NewStatus from '../../src/status.js'
import type * as OldForm from './legacy-declarations/form.js'
import type * as NewForm from '../../src/form.js'
import type * as OldFeedResolver from './legacy-declarations/feed-resolver.js'
import type * as NewFeedResolver from '../../src/feed-resolver.js'
import type * as OldDownloadOptions from './legacy-declarations/download-options.js'
import type * as NewDownloadOptions from '../../src/download-options.js'

// keyof exposes only public members; comparing class instances directly would compare private owner fields.
type PublicMembers<T> = { [K in keyof T]: T[K] }
type Assignable<From, To> = [From] extends [To] ? true : false
interface OldPublicShapes {
  'FeedParser.discoverFeedUrls': typeof OldFeedParser.discoverFeedUrls
  'Store.LIST_PROFILE_ITEM_LIMIT': typeof OldStore.LIST_PROFILE_ITEM_LIMIT
  'Store.createSqliteSubscriptionsStore': typeof OldStore.createSqliteSubscriptionsStore
  'Store.createSqliteMetaStore': typeof OldStore.createSqliteMetaStore
  'Api.SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR': typeof OldApi.SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR
  'Types.FeedPlatform': OldTypes.FeedPlatform
  'Types.ProfilePlatform': OldTypes.ProfilePlatform
  'Types.SubscriptionPlatform': OldTypes.SubscriptionPlatform
  'Types.SubscriptionSourceKind': OldTypes.SubscriptionSourceKind
  'Types.ProfileSubscriptionCategory': OldTypes.ProfileSubscriptionCategory
  'Types.SubscriptionDownloadPreferences': OldTypes.SubscriptionDownloadPreferences
  'Types.SubscriptionStatus': OldTypes.SubscriptionStatus
  'Types.ResolvedFeed': OldTypes.ResolvedFeed
  'Types.SubscriptionRule': OldTypes.SubscriptionRule
  'Types.SubscriptionFeedItem': OldTypes.SubscriptionFeedItem
  'Types.SubscriptionWithItems': OldTypes.SubscriptionWithItems
  'Types.SubscriptionCreateInput': OldTypes.SubscriptionCreateInput
  'Types.SubscriptionUpdateInput': OldTypes.SubscriptionUpdateInput
  'Types.ParsedFeedItem': OldTypes.ParsedFeedItem
  'Types.ParsedFeed': OldTypes.ParsedFeed
  'Types.NormalizedFeedItem': OldTypes.NormalizedFeedItem
  'Types.ProfileFeedItem': OldTypes.ProfileFeedItem
  'Types.ProfileCategoryError': OldTypes.ProfileCategoryError
  'Types.ProfileCheckResult': OldTypes.ProfileCheckResult
  'Types.ProfileSourceFetcher': OldTypes.ProfileSourceFetcher
  'Types.LeaderKind': OldTypes.LeaderKind
  'Types.LeaderState': OldTypes.LeaderState
  'Types.LeaderAcquireOptions': OldTypes.LeaderAcquireOptions
  'Types.AutoDownloadDecision': OldTypes.AutoDownloadDecision
  'Store.SubscriptionsStore': OldStore.SubscriptionsStore
  'Store.QueueLinkSelector': OldStore.QueueLinkSelector
  'Store.CreateSqliteStoresOptions': OldStore.CreateSqliteStoresOptions
  'Store.InMemoryMetaStore.public': PublicMembers<OldStore.InMemoryMetaStore>
  'Store.InMemoryMetaStore.arguments': ConstructorParameters<typeof OldStore.InMemoryMetaStore>
  'Api.EnqueueItemContext': OldApi.EnqueueItemContext
  'Api.EnqueueItem': OldApi.EnqueueItem
  'Api.SubscriptionsApiOptions': OldApi.SubscriptionsApiOptions
  'Api.SubscriptionsApiEvent': OldApi.SubscriptionsApiEvent
  'Api.SubscriptionsApiListener': OldApi.SubscriptionsApiListener
  'Api.SubscriptionsApi.public': PublicMembers<OldApi.SubscriptionsApi>
  'Api.SubscriptionsApi.arguments': ConstructorParameters<typeof OldApi.SubscriptionsApi>
  'Leader.MetaStore': OldLeader.MetaStore
  'Leader.LeaderElectionOptions': OldLeader.LeaderElectionOptions
  'Leader.LeaderElection.public': PublicMembers<OldLeader.LeaderElection>
  'Leader.LeaderElection.arguments': ConstructorParameters<typeof OldLeader.LeaderElection>
  'Scheduler.FeedCheckSchedulerOptions': OldScheduler.FeedCheckSchedulerOptions
  'Scheduler.FeedCheckScheduler.public': PublicMembers<OldScheduler.FeedCheckScheduler>
  'Scheduler.FeedCheckScheduler.arguments': ConstructorParameters<typeof OldScheduler.FeedCheckScheduler>
  'FeedParser.FeedFetcher': OldFeedParser.FeedFetcher
  'FeedParser.RssParserFeedFetcher.public': PublicMembers<OldFeedParser.RssParserFeedFetcher>
  'FeedParser.RssParserFeedFetcher.arguments': ConstructorParameters<typeof OldFeedParser.RssParserFeedFetcher>
  'FeedItems.NormalizeOptions': OldFeedItems.NormalizeOptions
  'AutoDownload.AutoDownloadInputs': OldAutoDownload.AutoDownloadInputs
  'ProfilePolicy.ProfileDownloadInputs': OldProfilePolicy.ProfileDownloadInputs
  'ProfilePolicy.ProfileDownloadDecision': OldProfilePolicy.ProfileDownloadDecision
  'Status.SubscriptionStatusMeta': OldStatus.SubscriptionStatusMeta
  'Status.SubscriptionItemQueueStatus': OldStatus.SubscriptionItemQueueStatus
  'Types.values': typeof OldTypes
  'Form.values': typeof OldForm
  'Status.values': typeof OldStatus
  'FeedResolver.values': typeof OldFeedResolver
  'DownloadOptions.values': typeof OldDownloadOptions
  'FeedItems.values': typeof OldFeedItems
  'AutoDownload.values': typeof OldAutoDownload
  'ProfilePolicy.values': typeof OldProfilePolicy
  'FeedItems.timeline': OldFeedItems.SubscriptionFeedEntry<{id: string; items: OldTypes.SubscriptionFeedItem[]; extra: number}>
}
interface NewPublicShapes {
  'FeedParser.discoverFeedUrls': typeof NewFeedParser.discoverFeedUrls
  'Store.LIST_PROFILE_ITEM_LIMIT': typeof NewStore.LIST_PROFILE_ITEM_LIMIT
  'Store.createSqliteSubscriptionsStore': typeof NewStore.createSqliteSubscriptionsStore
  'Store.createSqliteMetaStore': typeof NewStore.createSqliteMetaStore
  'Api.SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR': typeof NewApi.SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR
  'Types.FeedPlatform': NewTypes.FeedPlatform
  'Types.ProfilePlatform': NewTypes.ProfilePlatform
  'Types.SubscriptionPlatform': NewTypes.SubscriptionPlatform
  'Types.SubscriptionSourceKind': NewTypes.SubscriptionSourceKind
  'Types.ProfileSubscriptionCategory': NewTypes.ProfileSubscriptionCategory
  'Types.SubscriptionDownloadPreferences': NewTypes.SubscriptionDownloadPreferences
  'Types.SubscriptionStatus': NewTypes.SubscriptionStatus
  'Types.ResolvedFeed': NewTypes.ResolvedFeed
  'Types.SubscriptionRule': NewTypes.SubscriptionRule
  'Types.SubscriptionFeedItem': NewTypes.SubscriptionFeedItem
  'Types.SubscriptionWithItems': NewTypes.SubscriptionWithItems
  'Types.SubscriptionCreateInput': NewTypes.SubscriptionCreateInput
  'Types.SubscriptionUpdateInput': NewTypes.SubscriptionUpdateInput
  'Types.ParsedFeedItem': NewTypes.ParsedFeedItem
  'Types.ParsedFeed': NewTypes.ParsedFeed
  'Types.NormalizedFeedItem': NewTypes.NormalizedFeedItem
  'Types.ProfileFeedItem': NewTypes.ProfileFeedItem
  'Types.ProfileCategoryError': NewTypes.ProfileCategoryError
  'Types.ProfileCheckResult': NewTypes.ProfileCheckResult
  'Types.ProfileSourceFetcher': NewTypes.ProfileSourceFetcher
  'Types.LeaderKind': NewTypes.LeaderKind
  'Types.LeaderState': NewTypes.LeaderState
  'Types.LeaderAcquireOptions': NewTypes.LeaderAcquireOptions
  'Types.AutoDownloadDecision': NewTypes.AutoDownloadDecision
  'Store.SubscriptionsStore': NewStore.SubscriptionsStore
  'Store.QueueLinkSelector': NewStore.QueueLinkSelector
  'Store.CreateSqliteStoresOptions': NewStore.CreateSqliteStoresOptions
  'Store.InMemoryMetaStore.public': PublicMembers<NewStore.InMemoryMetaStore>
  'Store.InMemoryMetaStore.arguments': ConstructorParameters<typeof NewStore.InMemoryMetaStore>
  'Api.EnqueueItemContext': NewApi.EnqueueItemContext
  'Api.EnqueueItem': NewApi.EnqueueItem
  'Api.SubscriptionsApiOptions': NewApi.SubscriptionsApiOptions
  'Api.SubscriptionsApiEvent': NewApi.SubscriptionsApiEvent
  'Api.SubscriptionsApiListener': NewApi.SubscriptionsApiListener
  'Api.SubscriptionsApi.public': PublicMembers<NewApi.SubscriptionsApi>
  'Api.SubscriptionsApi.arguments': ConstructorParameters<typeof NewApi.SubscriptionsApi>
  'Leader.MetaStore': NewLeader.MetaStore
  'Leader.LeaderElectionOptions': NewLeader.LeaderElectionOptions
  'Leader.LeaderElection.public': PublicMembers<NewLeader.LeaderElection>
  'Leader.LeaderElection.arguments': ConstructorParameters<typeof NewLeader.LeaderElection>
  'Scheduler.FeedCheckSchedulerOptions': NewScheduler.FeedCheckSchedulerOptions
  'Scheduler.FeedCheckScheduler.public': PublicMembers<NewScheduler.FeedCheckScheduler>
  'Scheduler.FeedCheckScheduler.arguments': ConstructorParameters<typeof NewScheduler.FeedCheckScheduler>
  'FeedParser.FeedFetcher': NewFeedParser.FeedFetcher
  'FeedParser.RssParserFeedFetcher.public': PublicMembers<NewFeedParser.RssParserFeedFetcher>
  'FeedParser.RssParserFeedFetcher.arguments': ConstructorParameters<typeof NewFeedParser.RssParserFeedFetcher>
  'FeedItems.NormalizeOptions': NewFeedItems.NormalizeOptions
  'AutoDownload.AutoDownloadInputs': NewAutoDownload.AutoDownloadInputs
  'ProfilePolicy.ProfileDownloadInputs': NewProfilePolicy.ProfileDownloadInputs
  'ProfilePolicy.ProfileDownloadDecision': NewProfilePolicy.ProfileDownloadDecision
  'Status.SubscriptionStatusMeta': NewStatus.SubscriptionStatusMeta
  'Status.SubscriptionItemQueueStatus': NewStatus.SubscriptionItemQueueStatus
  'Types.values': Pick<typeof NewTypes, keyof typeof OldTypes>
  'Form.values': Pick<typeof NewForm, keyof typeof OldForm>
  'Status.values': Pick<typeof NewStatus, keyof typeof OldStatus>
  'FeedResolver.values': Pick<typeof NewFeedResolver, keyof typeof OldFeedResolver>
  'DownloadOptions.values': Pick<typeof NewDownloadOptions, keyof typeof OldDownloadOptions>
  'FeedItems.values': Pick<typeof NewFeedItems, keyof typeof OldFeedItems>
  'AutoDownload.values': Pick<typeof NewAutoDownload, keyof typeof OldAutoDownload>
  'ProfilePolicy.values': Pick<typeof NewProfilePolicy, keyof typeof OldProfilePolicy>
  'FeedItems.timeline': NewFeedItems.SubscriptionFeedEntry<{id: string; items: NewTypes.SubscriptionFeedItem[]; extra: number}>
}
export const mutualPublicShapeCompatibility: {
  [K in keyof OldPublicShapes]: readonly [Assignable<OldPublicShapes[K], NewPublicShapes[K]>, Assignable<NewPublicShapes[K], OldPublicShapes[K]>]
} = {
  'FeedParser.discoverFeedUrls': [true, true],
  'Store.LIST_PROFILE_ITEM_LIMIT': [true, true],
  'Store.createSqliteSubscriptionsStore': [true, true],
  'Store.createSqliteMetaStore': [true, true],
  'Api.SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR': [true, true],
  'Types.FeedPlatform': [true, true],
  'Types.ProfilePlatform': [true, true],
  'Types.SubscriptionPlatform': [true, true],
  'Types.SubscriptionSourceKind': [true, true],
  'Types.ProfileSubscriptionCategory': [true, true],
  'Types.SubscriptionDownloadPreferences': [true, true],
  'Types.SubscriptionStatus': [true, true],
  'Types.ResolvedFeed': [true, true],
  'Types.SubscriptionRule': [true, true],
  'Types.SubscriptionFeedItem': [true, true],
  'Types.SubscriptionWithItems': [true, true],
  'Types.SubscriptionCreateInput': [true, true],
  'Types.SubscriptionUpdateInput': [true, true],
  'Types.ParsedFeedItem': [true, true],
  'Types.ParsedFeed': [true, true],
  'Types.NormalizedFeedItem': [true, true],
  'Types.ProfileFeedItem': [true, true],
  'Types.ProfileCategoryError': [true, true],
  'Types.ProfileCheckResult': [true, true],
  'Types.ProfileSourceFetcher': [true, true],
  'Types.LeaderKind': [true, true],
  'Types.LeaderState': [true, true],
  'Types.LeaderAcquireOptions': [true, true],
  'Types.AutoDownloadDecision': [true, true],
  'Store.SubscriptionsStore': [true, true],
  'Store.QueueLinkSelector': [true, true],
  'Store.CreateSqliteStoresOptions': [true, true],
  'Store.InMemoryMetaStore.public': [true, true],
  'Store.InMemoryMetaStore.arguments': [true, true],
  'Api.EnqueueItemContext': [true, true],
  'Api.EnqueueItem': [true, true],
  'Api.SubscriptionsApiOptions': [true, true],
  'Api.SubscriptionsApiEvent': [true, true],
  'Api.SubscriptionsApiListener': [true, true],
  'Api.SubscriptionsApi.public': [true, true],
  'Api.SubscriptionsApi.arguments': [true, true],
  'Leader.MetaStore': [true, true],
  'Leader.LeaderElectionOptions': [true, true],
  'Leader.LeaderElection.public': [true, true],
  'Leader.LeaderElection.arguments': [true, true],
  'Scheduler.FeedCheckSchedulerOptions': [true, true],
  'Scheduler.FeedCheckScheduler.public': [true, true],
  'Scheduler.FeedCheckScheduler.arguments': [true, true],
  'FeedParser.FeedFetcher': [true, true],
  'FeedParser.RssParserFeedFetcher.public': [true, true],
  'FeedParser.RssParserFeedFetcher.arguments': [true, true],
  'FeedItems.NormalizeOptions': [true, true],
  'AutoDownload.AutoDownloadInputs': [true, true],
  'ProfilePolicy.ProfileDownloadInputs': [true, true],
  'ProfilePolicy.ProfileDownloadDecision': [true, true],
  'Status.SubscriptionStatusMeta': [true, true],
  'Status.SubscriptionItemQueueStatus': [true, true],
  'Types.values': [true, true],
  'Form.values': [true, true],
  'Status.values': [true, true],
  'FeedResolver.values': [true, true],
  'DownloadOptions.values': [true, true],
  'FeedItems.values': [true, true],
  'AutoDownload.values': [true, true],
  'ProfilePolicy.values': [true, true],
  'FeedItems.timeline': [true, true],
}
