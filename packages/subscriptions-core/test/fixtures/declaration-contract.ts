// Positive public-declaration fixtures. These functions are checked but never executed.
// Frozen declarations remain unimported until compatibility checks are installed.
import type {SubscriptionCreateInput, SubscriptionUpdateInput, SubscriptionWithItems, ParsedFeedItem, ProfileCheckResult} from '@vidbee/subscriptions-core/types'
import type {QueueLinkSelector, SubscriptionsStore} from '@vidbee/subscriptions-core/store'
import type {SubscriptionsApi, EnqueueItem, SubscriptionsApiListener} from '@vidbee/subscriptions-core/api'
import {getSubscriptionFeedEntries, dedupeFeedItems} from '@vidbee/subscriptions-core/feed-items'

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
