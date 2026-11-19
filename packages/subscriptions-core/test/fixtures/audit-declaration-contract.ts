// Every frozen public declaration is checked in both assignment directions. No runtime execution.
type Public<T> = { [K in keyof T]: T[K] }
type Surface<T> = T extends abstract new (...args: infer A) => infer I ? new (...args: A) => Public<I> : T
type Module<T> = { [K in keyof T]: Surface<T[K]> }
import type * as Live0 from '@vidbee/subscriptions-core/api'
import type * as Old0 from './legacy-declarations/api'
declare const live0: Module<typeof Live0>
declare const old0: Module<typeof Old0>
export const valuesOld0: Module<typeof Old0> = live0
export const valuesLive0: Module<typeof Live0> = old0
declare const live0_EnqueueItemContext: Live0.EnqueueItemContext
declare const old0_EnqueueItemContext: Old0.EnqueueItemContext
export const old0_EnqueueItemContextCheck: Old0.EnqueueItemContext = live0_EnqueueItemContext
export const live0_EnqueueItemContextCheck: Live0.EnqueueItemContext = old0_EnqueueItemContext
declare const live0_EnqueueItem: Live0.EnqueueItem
declare const old0_EnqueueItem: Old0.EnqueueItem
export const old0_EnqueueItemCheck: Old0.EnqueueItem = live0_EnqueueItem
export const live0_EnqueueItemCheck: Live0.EnqueueItem = old0_EnqueueItem
declare const live0_SubscriptionsApiOptions: Live0.SubscriptionsApiOptions
declare const old0_SubscriptionsApiOptions: Old0.SubscriptionsApiOptions
export const old0_SubscriptionsApiOptionsCheck: Old0.SubscriptionsApiOptions = live0_SubscriptionsApiOptions
export const live0_SubscriptionsApiOptionsCheck: Live0.SubscriptionsApiOptions = old0_SubscriptionsApiOptions
declare const live0_SubscriptionsApiEvent: Live0.SubscriptionsApiEvent
declare const old0_SubscriptionsApiEvent: Old0.SubscriptionsApiEvent
export const old0_SubscriptionsApiEventCheck: Old0.SubscriptionsApiEvent = live0_SubscriptionsApiEvent
export const live0_SubscriptionsApiEventCheck: Live0.SubscriptionsApiEvent = old0_SubscriptionsApiEvent
declare const live0_SubscriptionsApiListener: Live0.SubscriptionsApiListener
declare const old0_SubscriptionsApiListener: Old0.SubscriptionsApiListener
export const old0_SubscriptionsApiListenerCheck: Old0.SubscriptionsApiListener = live0_SubscriptionsApiListener
export const live0_SubscriptionsApiListenerCheck: Live0.SubscriptionsApiListener = old0_SubscriptionsApiListener
import type * as Live1 from '@vidbee/subscriptions-core/auto-download'
import type * as Old1 from './legacy-declarations/auto-download'
declare const live1: Module<typeof Live1>
declare const old1: Module<typeof Old1>
export const valuesOld1: Module<typeof Old1> = live1
export const valuesLive1: Module<typeof Live1> = old1
declare const live1_AutoDownloadInputs: Live1.AutoDownloadInputs
declare const old1_AutoDownloadInputs: Old1.AutoDownloadInputs
export const old1_AutoDownloadInputsCheck: Old1.AutoDownloadInputs = live1_AutoDownloadInputs
export const live1_AutoDownloadInputsCheck: Live1.AutoDownloadInputs = old1_AutoDownloadInputs
import type * as Live2 from '@vidbee/subscriptions-core/download-options'
import type * as Old2 from './legacy-declarations/download-options'
declare const live2: Module<typeof Live2>
declare const old2: Module<typeof Old2>
export const valuesOld2: Module<typeof Old2> = live2
export const valuesLive2: Module<typeof Live2> = old2
import type * as Live3 from '@vidbee/subscriptions-core/feed-items'
import type * as Old3 from './legacy-declarations/feed-items'
declare const live3: Module<typeof Live3>
declare const old3: Module<typeof Old3>
export const valuesOld3: Module<typeof Old3> = live3
export const valuesLive3: Module<typeof Live3> = old3
declare const live3_SubscriptionFeedEntry: Live3.SubscriptionFeedEntry<{ id: string; items: [] }>
declare const old3_SubscriptionFeedEntry: Old3.SubscriptionFeedEntry<{ id: string; items: [] }>
export const old3_SubscriptionFeedEntryCheck: Old3.SubscriptionFeedEntry<{ id: string; items: [] }> = live3_SubscriptionFeedEntry
export const live3_SubscriptionFeedEntryCheck: Live3.SubscriptionFeedEntry<{ id: string; items: [] }> = old3_SubscriptionFeedEntry
declare const live3_NormalizeOptions: Live3.NormalizeOptions
declare const old3_NormalizeOptions: Old3.NormalizeOptions
export const old3_NormalizeOptionsCheck: Old3.NormalizeOptions = live3_NormalizeOptions
export const live3_NormalizeOptionsCheck: Live3.NormalizeOptions = old3_NormalizeOptions
import type * as Live4 from '@vidbee/subscriptions-core/feed-parser'
import type * as Old4 from './legacy-declarations/feed-parser'
declare const live4: Module<typeof Live4>
declare const old4: Module<typeof Old4>
export const valuesOld4: Module<typeof Old4> = live4
export const valuesLive4: Module<typeof Live4> = old4
declare const live4_FeedFetcher: Live4.FeedFetcher
declare const old4_FeedFetcher: Old4.FeedFetcher
export const old4_FeedFetcherCheck: Old4.FeedFetcher = live4_FeedFetcher
export const live4_FeedFetcherCheck: Live4.FeedFetcher = old4_FeedFetcher
import type * as Live5 from '@vidbee/subscriptions-core/feed-resolver'
import type * as Old5 from './legacy-declarations/feed-resolver'
declare const live5: Module<typeof Live5>
declare const old5: Module<typeof Old5>
export const valuesOld5: Module<typeof Old5> = live5
export const valuesLive5: Module<typeof Live5> = old5
import type * as Live6 from '@vidbee/subscriptions-core/form'
import type * as Old6 from './legacy-declarations/form'
declare const live6: Module<typeof Live6>
declare const old6: Module<typeof Old6>
export const valuesOld6: Module<typeof Old6> = live6
export const valuesLive6: Module<typeof Live6> = old6
import type * as Live7 from '@vidbee/subscriptions-core'
import type * as Old7 from './legacy-declarations/index'
declare const live7: Module<typeof Live7>
declare const old7: Module<typeof Old7>
export const valuesOld7: Module<typeof Old7> = live7
export const valuesLive7: Module<typeof Live7> = old7
import type * as Live8 from '@vidbee/subscriptions-core/leader'
import type * as Old8 from './legacy-declarations/leader'
declare const live8: Module<typeof Live8>
declare const old8: Module<typeof Old8>
export const valuesOld8: Module<typeof Old8> = live8
export const valuesLive8: Module<typeof Live8> = old8
declare const live8_MetaStore: Live8.MetaStore
declare const old8_MetaStore: Old8.MetaStore
export const old8_MetaStoreCheck: Old8.MetaStore = live8_MetaStore
export const live8_MetaStoreCheck: Live8.MetaStore = old8_MetaStore
declare const live8_LeaderElectionOptions: Live8.LeaderElectionOptions
declare const old8_LeaderElectionOptions: Old8.LeaderElectionOptions
export const old8_LeaderElectionOptionsCheck: Old8.LeaderElectionOptions = live8_LeaderElectionOptions
export const live8_LeaderElectionOptionsCheck: Live8.LeaderElectionOptions = old8_LeaderElectionOptions
import type * as Live9 from '@vidbee/subscriptions-core/profile-policy'
import type * as Old9 from './legacy-declarations/profile-policy'
declare const live9: Module<typeof Live9>
declare const old9: Module<typeof Old9>
export const valuesOld9: Module<typeof Old9> = live9
export const valuesLive9: Module<typeof Live9> = old9
declare const live9_ProfileDownloadInputs: Live9.ProfileDownloadInputs
declare const old9_ProfileDownloadInputs: Old9.ProfileDownloadInputs
export const old9_ProfileDownloadInputsCheck: Old9.ProfileDownloadInputs = live9_ProfileDownloadInputs
export const live9_ProfileDownloadInputsCheck: Live9.ProfileDownloadInputs = old9_ProfileDownloadInputs
declare const live9_ProfileDownloadDecision: Live9.ProfileDownloadDecision
declare const old9_ProfileDownloadDecision: Old9.ProfileDownloadDecision
export const old9_ProfileDownloadDecisionCheck: Old9.ProfileDownloadDecision = live9_ProfileDownloadDecision
export const live9_ProfileDownloadDecisionCheck: Live9.ProfileDownloadDecision = old9_ProfileDownloadDecision
import type * as Live10 from '@vidbee/subscriptions-core/scheduler'
import type * as Old10 from './legacy-declarations/scheduler'
declare const live10: Module<typeof Live10>
declare const old10: Module<typeof Old10>
export const valuesOld10: Module<typeof Old10> = live10
export const valuesLive10: Module<typeof Live10> = old10
declare const live10_FeedCheckSchedulerOptions: Live10.FeedCheckSchedulerOptions
declare const old10_FeedCheckSchedulerOptions: Old10.FeedCheckSchedulerOptions
export const old10_FeedCheckSchedulerOptionsCheck: Old10.FeedCheckSchedulerOptions = live10_FeedCheckSchedulerOptions
export const live10_FeedCheckSchedulerOptionsCheck: Live10.FeedCheckSchedulerOptions = old10_FeedCheckSchedulerOptions
import type * as Live11 from '@vidbee/subscriptions-core/schemas'
import type * as Old11 from './legacy-declarations/schemas'
declare const live11: Module<typeof Live11>
declare const old11: Module<typeof Old11>
export const valuesOld11: Module<typeof Old11> = live11
export const valuesLive11: Module<typeof Live11> = old11
import type * as Live12 from '@vidbee/subscriptions-core/status'
import type * as Old12 from './legacy-declarations/status'
declare const live12: Module<typeof Live12>
declare const old12: Module<typeof Old12>
export const valuesOld12: Module<typeof Old12> = live12
export const valuesLive12: Module<typeof Live12> = old12
declare const live12_SubscriptionStatusMeta: Live12.SubscriptionStatusMeta
declare const old12_SubscriptionStatusMeta: Old12.SubscriptionStatusMeta
export const old12_SubscriptionStatusMetaCheck: Old12.SubscriptionStatusMeta = live12_SubscriptionStatusMeta
export const live12_SubscriptionStatusMetaCheck: Live12.SubscriptionStatusMeta = old12_SubscriptionStatusMeta
declare const live12_SubscriptionItemQueueStatus: Live12.SubscriptionItemQueueStatus
declare const old12_SubscriptionItemQueueStatus: Old12.SubscriptionItemQueueStatus
export const old12_SubscriptionItemQueueStatusCheck: Old12.SubscriptionItemQueueStatus = live12_SubscriptionItemQueueStatus
export const live12_SubscriptionItemQueueStatusCheck: Live12.SubscriptionItemQueueStatus = old12_SubscriptionItemQueueStatus
import type * as Live13 from '@vidbee/subscriptions-core/store'
import type * as Old13 from './legacy-declarations/store'
declare const live13: Module<typeof Live13>
declare const old13: Module<typeof Old13>
export const valuesOld13: Module<typeof Old13> = live13
export const valuesLive13: Module<typeof Live13> = old13
declare const live13_SubscriptionsStore: Live13.SubscriptionsStore
declare const old13_SubscriptionsStore: Old13.SubscriptionsStore
export const old13_SubscriptionsStoreCheck: Old13.SubscriptionsStore = live13_SubscriptionsStore
export const live13_SubscriptionsStoreCheck: Live13.SubscriptionsStore = old13_SubscriptionsStore
declare const live13_QueueLinkSelector: Live13.QueueLinkSelector
declare const old13_QueueLinkSelector: Old13.QueueLinkSelector
export const old13_QueueLinkSelectorCheck: Old13.QueueLinkSelector = live13_QueueLinkSelector
export const live13_QueueLinkSelectorCheck: Live13.QueueLinkSelector = old13_QueueLinkSelector
declare const live13_CreateSqliteStoresOptions: Live13.CreateSqliteStoresOptions
declare const old13_CreateSqliteStoresOptions: Old13.CreateSqliteStoresOptions
export const old13_CreateSqliteStoresOptionsCheck: Old13.CreateSqliteStoresOptions = live13_CreateSqliteStoresOptions
export const live13_CreateSqliteStoresOptionsCheck: Live13.CreateSqliteStoresOptions = old13_CreateSqliteStoresOptions
import type * as Live14 from '@vidbee/subscriptions-core/types'
import type * as Old14 from './legacy-declarations/types'
declare const live14: Module<typeof Live14>
declare const old14: Module<typeof Old14>
export const valuesOld14: Module<typeof Old14> = live14
export const valuesLive14: Module<typeof Live14> = old14
declare const live14_FeedPlatform: Live14.FeedPlatform
declare const old14_FeedPlatform: Old14.FeedPlatform
export const old14_FeedPlatformCheck: Old14.FeedPlatform = live14_FeedPlatform
export const live14_FeedPlatformCheck: Live14.FeedPlatform = old14_FeedPlatform
declare const live14_ProfilePlatform: Live14.ProfilePlatform
declare const old14_ProfilePlatform: Old14.ProfilePlatform
export const old14_ProfilePlatformCheck: Old14.ProfilePlatform = live14_ProfilePlatform
export const live14_ProfilePlatformCheck: Live14.ProfilePlatform = old14_ProfilePlatform
declare const live14_SubscriptionPlatform: Live14.SubscriptionPlatform
declare const old14_SubscriptionPlatform: Old14.SubscriptionPlatform
export const old14_SubscriptionPlatformCheck: Old14.SubscriptionPlatform = live14_SubscriptionPlatform
export const live14_SubscriptionPlatformCheck: Live14.SubscriptionPlatform = old14_SubscriptionPlatform
declare const live14_SubscriptionSourceKind: Live14.SubscriptionSourceKind
declare const old14_SubscriptionSourceKind: Old14.SubscriptionSourceKind
export const old14_SubscriptionSourceKindCheck: Old14.SubscriptionSourceKind = live14_SubscriptionSourceKind
export const live14_SubscriptionSourceKindCheck: Live14.SubscriptionSourceKind = old14_SubscriptionSourceKind
declare const live14_ProfileSubscriptionCategory: Live14.ProfileSubscriptionCategory
declare const old14_ProfileSubscriptionCategory: Old14.ProfileSubscriptionCategory
export const old14_ProfileSubscriptionCategoryCheck: Old14.ProfileSubscriptionCategory = live14_ProfileSubscriptionCategory
export const live14_ProfileSubscriptionCategoryCheck: Live14.ProfileSubscriptionCategory = old14_ProfileSubscriptionCategory
declare const live14_SubscriptionDownloadPreferences: Live14.SubscriptionDownloadPreferences
declare const old14_SubscriptionDownloadPreferences: Old14.SubscriptionDownloadPreferences
export const old14_SubscriptionDownloadPreferencesCheck: Old14.SubscriptionDownloadPreferences = live14_SubscriptionDownloadPreferences
export const live14_SubscriptionDownloadPreferencesCheck: Live14.SubscriptionDownloadPreferences = old14_SubscriptionDownloadPreferences
declare const live14_SubscriptionStatus: Live14.SubscriptionStatus
declare const old14_SubscriptionStatus: Old14.SubscriptionStatus
export const old14_SubscriptionStatusCheck: Old14.SubscriptionStatus = live14_SubscriptionStatus
export const live14_SubscriptionStatusCheck: Live14.SubscriptionStatus = old14_SubscriptionStatus
declare const live14_ResolvedFeed: Live14.ResolvedFeed
declare const old14_ResolvedFeed: Old14.ResolvedFeed
export const old14_ResolvedFeedCheck: Old14.ResolvedFeed = live14_ResolvedFeed
export const live14_ResolvedFeedCheck: Live14.ResolvedFeed = old14_ResolvedFeed
declare const live14_SubscriptionRule: Live14.SubscriptionRule
declare const old14_SubscriptionRule: Old14.SubscriptionRule
export const old14_SubscriptionRuleCheck: Old14.SubscriptionRule = live14_SubscriptionRule
export const live14_SubscriptionRuleCheck: Live14.SubscriptionRule = old14_SubscriptionRule
declare const live14_SubscriptionFeedItem: Live14.SubscriptionFeedItem
declare const old14_SubscriptionFeedItem: Old14.SubscriptionFeedItem
export const old14_SubscriptionFeedItemCheck: Old14.SubscriptionFeedItem = live14_SubscriptionFeedItem
export const live14_SubscriptionFeedItemCheck: Live14.SubscriptionFeedItem = old14_SubscriptionFeedItem
declare const live14_SubscriptionWithItems: Live14.SubscriptionWithItems
declare const old14_SubscriptionWithItems: Old14.SubscriptionWithItems
export const old14_SubscriptionWithItemsCheck: Old14.SubscriptionWithItems = live14_SubscriptionWithItems
export const live14_SubscriptionWithItemsCheck: Live14.SubscriptionWithItems = old14_SubscriptionWithItems
declare const live14_SubscriptionCreateInput: Live14.SubscriptionCreateInput
declare const old14_SubscriptionCreateInput: Old14.SubscriptionCreateInput
export const old14_SubscriptionCreateInputCheck: Old14.SubscriptionCreateInput = live14_SubscriptionCreateInput
export const live14_SubscriptionCreateInputCheck: Live14.SubscriptionCreateInput = old14_SubscriptionCreateInput
declare const live14_SubscriptionUpdateInput: Live14.SubscriptionUpdateInput
declare const old14_SubscriptionUpdateInput: Old14.SubscriptionUpdateInput
export const old14_SubscriptionUpdateInputCheck: Old14.SubscriptionUpdateInput = live14_SubscriptionUpdateInput
export const live14_SubscriptionUpdateInputCheck: Live14.SubscriptionUpdateInput = old14_SubscriptionUpdateInput
declare const live14_ParsedFeedItem: Live14.ParsedFeedItem
declare const old14_ParsedFeedItem: Old14.ParsedFeedItem
export const old14_ParsedFeedItemCheck: Old14.ParsedFeedItem = live14_ParsedFeedItem
export const live14_ParsedFeedItemCheck: Live14.ParsedFeedItem = old14_ParsedFeedItem
declare const live14_ParsedFeed: Live14.ParsedFeed
declare const old14_ParsedFeed: Old14.ParsedFeed
export const old14_ParsedFeedCheck: Old14.ParsedFeed = live14_ParsedFeed
export const live14_ParsedFeedCheck: Live14.ParsedFeed = old14_ParsedFeed
declare const live14_NormalizedFeedItem: Live14.NormalizedFeedItem
declare const old14_NormalizedFeedItem: Old14.NormalizedFeedItem
export const old14_NormalizedFeedItemCheck: Old14.NormalizedFeedItem = live14_NormalizedFeedItem
export const live14_NormalizedFeedItemCheck: Live14.NormalizedFeedItem = old14_NormalizedFeedItem
declare const live14_ProfileFeedItem: Live14.ProfileFeedItem
declare const old14_ProfileFeedItem: Old14.ProfileFeedItem
export const old14_ProfileFeedItemCheck: Old14.ProfileFeedItem = live14_ProfileFeedItem
export const live14_ProfileFeedItemCheck: Live14.ProfileFeedItem = old14_ProfileFeedItem
declare const live14_ProfileCategoryError: Live14.ProfileCategoryError
declare const old14_ProfileCategoryError: Old14.ProfileCategoryError
export const old14_ProfileCategoryErrorCheck: Old14.ProfileCategoryError = live14_ProfileCategoryError
export const live14_ProfileCategoryErrorCheck: Live14.ProfileCategoryError = old14_ProfileCategoryError
declare const live14_ProfileCheckResult: Live14.ProfileCheckResult
declare const old14_ProfileCheckResult: Old14.ProfileCheckResult
export const old14_ProfileCheckResultCheck: Old14.ProfileCheckResult = live14_ProfileCheckResult
export const live14_ProfileCheckResultCheck: Live14.ProfileCheckResult = old14_ProfileCheckResult
declare const live14_ProfileSourceFetcher: Live14.ProfileSourceFetcher
declare const old14_ProfileSourceFetcher: Old14.ProfileSourceFetcher
export const old14_ProfileSourceFetcherCheck: Old14.ProfileSourceFetcher = live14_ProfileSourceFetcher
export const live14_ProfileSourceFetcherCheck: Live14.ProfileSourceFetcher = old14_ProfileSourceFetcher
declare const live14_LeaderKind: Live14.LeaderKind
declare const old14_LeaderKind: Old14.LeaderKind
export const old14_LeaderKindCheck: Old14.LeaderKind = live14_LeaderKind
export const live14_LeaderKindCheck: Live14.LeaderKind = old14_LeaderKind
declare const live14_LeaderState: Live14.LeaderState
declare const old14_LeaderState: Old14.LeaderState
export const old14_LeaderStateCheck: Old14.LeaderState = live14_LeaderState
export const live14_LeaderStateCheck: Live14.LeaderState = old14_LeaderState
declare const live14_LeaderAcquireOptions: Live14.LeaderAcquireOptions
declare const old14_LeaderAcquireOptions: Old14.LeaderAcquireOptions
export const old14_LeaderAcquireOptionsCheck: Old14.LeaderAcquireOptions = live14_LeaderAcquireOptions
export const live14_LeaderAcquireOptionsCheck: Live14.LeaderAcquireOptions = old14_LeaderAcquireOptions
declare const live14_AutoDownloadDecision: Live14.AutoDownloadDecision
declare const old14_AutoDownloadDecision: Old14.AutoDownloadDecision
export const old14_AutoDownloadDecisionCheck: Old14.AutoDownloadDecision = live14_AutoDownloadDecision
export const live14_AutoDownloadDecisionCheck: Live14.AutoDownloadDecision = old14_AutoDownloadDecision
