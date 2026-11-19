import * as Strict from '@vidbee/subscriptions-core/status'
export type {SubscriptionStatusMeta,SubscriptionItemQueueStatus} from '@vidbee/subscriptions-core/status'
export const disabledStatusMeta=Strict.disabledStatusMeta
export const getSubscriptionStatusMeta:(status:string|undefined,enabled:boolean)=>Strict.SubscriptionStatusMeta=Strict.getSubscriptionStatusMeta
export const resolveSubscriptionItemStatus:(item:{addedToQueue:boolean;downloadId?:string;taskId?:string},downloadById:ReadonlyMap<string,{status:string}>)=>Strict.SubscriptionItemQueueStatus=Strict.resolveSubscriptionItemStatus
