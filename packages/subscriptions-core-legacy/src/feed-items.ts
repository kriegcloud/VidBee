import {normalizeFeedItems as normalize} from '@vidbee/subscriptions-core/feed-items'
import type {NormalizedFeedItem,ParsedFeedItem,ParsedFeed} from './types.js'
export {dedupeFeedItems,getSubscriptionFeedEntries,resolveThumbnail} from '@vidbee/subscriptions-core/feed-items'
export type {SubscriptionFeedEntry} from '@vidbee/subscriptions-core/feed-items'
export interface NormalizeOptions {now?:()=>number}
export const normalizeFeedItems=(items:ParsedFeedItem[],options:NormalizeOptions={}):NormalizedFeedItem[]=>
 normalize(items,{now:options.now??(()=>Date.now()),parseDate:(value)=>{
  const time=Date.parse(value as string)
  return Number.isNaN(time)?null:time
 }})

import {resolveFeedCover as cover} from '@vidbee/subscriptions-core/feed-items'
export const resolveFeedCover:(feed:Pick<ParsedFeed,'image'|'itunes'>,items:NormalizedFeedItem[],rawItems:ParsedFeedItem[])=>string|undefined=cover
