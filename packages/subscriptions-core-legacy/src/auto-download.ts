import {decideAutoDownloads as decide} from '@vidbee/subscriptions-core/auto-download'
import type {AutoDownloadDecision,SubscriptionRule,SubscriptionFeedItem,ParsedFeed} from './types.js'
export interface AutoDownloadInputs {
 subscription:SubscriptionRule
 knownItems:SubscriptionFeedItem[]
 feed:ParsedFeed
 isHistoryDup?:(url:string)=>boolean
 now?:()=>number
}
export const decideAutoDownloads=({subscription,knownItems,feed,isHistoryDup,now=()=>Date.now()}:AutoDownloadInputs):AutoDownloadDecision=>
 decide({subscription,knownItems,feed,isHistoryDup},{now,parseDate:value=>{
  const time=Date.parse(value as string)
  return Number.isNaN(time)?null:time
 }})
