export * from '@vidbee/subscriptions-core/types'
import type {SubscriptionRule,ProfileCheckResult,LeaderKind} from '@vidbee/subscriptions-core/types'

export interface ProfileSourceFetcher {
  fetch(subscription: SubscriptionRule, signal: AbortSignal): Promise<ProfileCheckResult>
}

export interface LeaderAcquireOptions {
  kind: LeaderKind
  pid: number
  /** Defaults to 30_000ms. */
  heartbeatIntervalMs?: number
  /** Defaults to 90_000ms. */
  lockTtlMs?: number
  now?: () => number
}

import * as Strict from '@vidbee/subscriptions-core/types'
export const profileItemId:(category:string,id:string)=>string=Strict.profileItemId
export const profileItemCategory:(platform:Strict.SubscriptionPlatform,itemId:string)=>string|undefined=Strict.profileItemCategory
