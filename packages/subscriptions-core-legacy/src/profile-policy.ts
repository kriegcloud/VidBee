import {decideProfileDownloads as decide,nextProfileCheckAt as next} from '@vidbee/subscriptions-core/profile-policy'
import type {SubscriptionRule,SubscriptionFeedItem,ProfileCheckResult,NormalizedFeedItem,SubscriptionStatus} from './types.js'
export {resolveCheckIntervalMs} from '@vidbee/subscriptions-core/profile-policy'
export interface ProfileDownloadInputs {
 subscription:SubscriptionRule
 knownItems:SubscriptionFeedItem[]
 result:ProfileCheckResult
 isHistoryDup?:(url:string)=>boolean
 now?:()=>number
}
export interface ProfileDownloadDecision {items:NormalizedFeedItem[];itemsToPersist:NormalizedFeedItem[];latest?:NormalizedFeedItem}
export const decideProfileDownloads=({subscription,knownItems,result,isHistoryDup,now=()=>Date.now()}:ProfileDownloadInputs):ProfileDownloadDecision=>
 decide({subscription,knownItems,result,isHistoryDup},now)
export const nextProfileCheckAt=(subscription:SubscriptionRule,now:number,retryAfter?:number,random:()=>number=Math.random):number=>next(subscription,now,retryAfter,random)

import {isSubscriptionDue as due,summarizeProfileStatus as status} from '@vidbee/subscriptions-core/profile-policy'
export const isSubscriptionDue:(subscription:SubscriptionRule,now:number)=>boolean=due
export const summarizeProfileStatus:(subscription:SubscriptionRule,result:ProfileCheckResult)=>SubscriptionStatus=status
