import type {TaskCreationMetadata} from '@vidbee/task-queue-legacy'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacyPromise,runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {Subscriptions as NativeApi} from '@vidbee/subscriptions-core/Subscriptions.service'
import {layer as apiLayer} from '@vidbee/subscriptions-core/Subscriptions.layer'
import {SubscriptionStore} from '@vidbee/subscriptions-core/SubscriptionStore.service'
import {SubscriptionMeta} from '@vidbee/subscriptions-core/SubscriptionMeta.service'
import {SubscriptionQueue} from '@vidbee/subscriptions-core/SubscriptionQueue.service'
import {SubscriptionFeed} from '@vidbee/subscriptions-core/SubscriptionFeed.service'
import {ProfileFeed} from '@vidbee/subscriptions-core/ProfileFeed.service'
import {LeaderElection} from './leader.js'
import {SubscriptionSchedulerSettings,SubscriptionSchedulerHost} from '@vidbee/subscriptions-core/SubscriptionScheduler.service'
import {SubscriptionPolicyHistory} from '@vidbee/subscriptions-core/SubscriptionPolicy.service'
import {DEFAULT_FEED_CHECK_INTERVAL_MS,DEFAULT_SCHEDULER_TICK_MS,DEFAULT_REFRESH_DEDUPE_WINDOW_MS} from './types.js'
import {CheckCancellation} from '@vidbee/subscriptions-core/CheckCancellation.service'
import {SubscriptionDates} from '@vidbee/subscriptions-core/SubscriptionDates.service'
import {layer as policyLayer} from '@vidbee/subscriptions-core/SubscriptionPolicy.layer'
import {layer as eventsLayer} from '@vidbee/subscriptions-core/SubscriptionEvents.layer'
import {layer as leaderLayer} from '@vidbee/subscriptions-core/SubscriptionLeader.layer'
import {LeaderStateSink} from '@vidbee/subscriptions-core/SubscriptionLeader.service'
import type {SubscriptionChangedSink} from '@vidbee/subscriptions-core/SubscriptionEvents.service'
import type {Operation} from '@vidbee/subscriptions-core/SubscriptionTimers.service'
import type {HostFailure} from '@vidbee/subscriptions-core/Subscriptions.errors'
import {feedCancellationHost} from './FeedCancellation.driver.js'
import {hostLayers,hostServices,promise,sync,legacyError} from './Host.driver.js'
import type {FeedFetcher} from './feed-parser.js'
import type {LeaderElectionOptions,MetaStore} from './leader.js'
import type {FeedCheckSchedulerOptions} from './scheduler.js'
import type {SubscriptionsStore} from './store.js'
import {SUBSCRIPTION_DUPLICATE_FEED_ERROR,type LeaderKind,type LeaderState,type NormalizedFeedItem,type ProfileSourceFetcher,type ResolvedFeed,type SubscriptionCreateInput,type SubscriptionFeedItem,type SubscriptionRule,type SubscriptionUpdateInput,type SubscriptionWithItems} from './types.js'

export interface EnqueueItemContext {
  creation?: TaskCreationMetadata
  subscription: SubscriptionRule
  item: NormalizedFeedItem
  /** Why we're enqueuing — 'auto' for scheduled feed-check, 'manual' for user. */
  trigger: 'auto' | 'manual'
  /** Items queued by one profile check share a queue batch. */
  batch?: { id: string; title: string }
}

/**
 * Host-provided callback that pushes the item into the shared task-queue.
 * Returns the spawned task id; null if the host decided to skip (e.g.
 * historic dedupe). Errors propagate.
 */
export type EnqueueItem = (ctx: EnqueueItemContext) => Promise<string | null>

export interface SubscriptionsApiOptions {
  kind: LeaderKind
  pid: number
  store: SubscriptionsStore
  metaStore: MetaStore
  fetcher: FeedFetcher
  /**
   * Checks profile subscriptions through the host's profile mappers. Hosts
   * without one (the API server) list profile subscriptions but never check
   * them; Desktop owns those checks regardless of the RSS leader lease.
   */
  profileFetcher?: ProfileSourceFetcher
  enqueueItem: EnqueueItem
  /** Optional: returns true if a URL is already in download history. */
  isHistoryDup?: (url: string) => boolean
  /**
   * Returns true when `taskId` still exists in the shared task database,
   * including history. Hosts must answer from that database: Desktop and the
   * API share `vidbee.db`, and a task the other host created after startup is
   * missing from this process's queue memory. Used to drop queue links for
   * removed tasks. When omitted, a stored queue flag keeps blocking manual
   * enqueue.
   */
  taskExists?: (taskId: string) => boolean | Promise<boolean>
  /**
   * Lifted out of `LeaderElectionOptions` for ergonomics; the rest of the
   * leader knobs (heartbeat ms, lock TTL ms, etc.) accept a single options
   * bag. Defaults match the NEX-132 spec.
   */
  leader?: Omit<LeaderElectionOptions, 'metaStore' | 'kind' | 'pid' | 'onStateChange'>
  scheduler?: Omit<FeedCheckSchedulerOptions, 'runAll' | 'runOne' | 'isLeader'>
  log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void
  now?: () => number
}

export { SUBSCRIPTION_DUPLICATE_FEED_ERROR }

/** Profile subscriptions are checked by VidBee Desktop; other hosts cannot create them. */
export const SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR = 'SUBSCRIPTION_PROFILE_DESKTOP_ONLY'

export type SubscriptionsApiEvent = 'changed'
export type SubscriptionsApiListener = (kind: SubscriptionsApiEvent) => void

export class SubscriptionsApi {
 private readonly runtime:ManagedRuntime.ManagedRuntime<NativeApi,never>
 private readonly sinks:Array<{listener:SubscriptionsApiListener;sink:SubscriptionChangedSink}>=[]
 constructor(opts:SubscriptionsApiOptions){
  const dispatch=(operation:Operation<void>)=>{void runLegacyPromise(this.runtime,operation,legacyError)}
  const enter=(operation:Effect.Effect<void,HostFailure>)=>{runLegacySync(this.runtime,operation,legacyError)}
  const signals=feedCancellationHost(enter)
  const profileFetcher=opts.profileFetcher??null
  const owner=Object.assign(this,{store:opts.store,fetcher:opts.fetcher,profileFetcher,enqueueItem:opts.enqueueItem,isHistoryDup:opts.isHistoryDup??(()=>false),taskExists:opts.taskExists??null,log:opts.log??(()=>undefined),now:opts.now??(()=>Date.now())})
  const metaStore=opts.metaStore
  const schedulerInput={intervalMs:DEFAULT_SCHEDULER_TICK_MS,...opts.scheduler}
  const schedulerReceiver={runAll:()=>this.refreshAll(),runOne:(id:string)=>this.refreshOne(id),isLeader:()=>true,
   intervalMs:schedulerInput.intervalMs??DEFAULT_FEED_CHECK_INTERVAL_MS,
   refreshDedupeWindowMs:schedulerInput.refreshDedupeWindowMs??DEFAULT_REFRESH_DEDUPE_WINDOW_MS,
   now:owner.now,log:owner.log,
   setTimeoutImpl:schedulerInput.setTimeoutImpl??((cb:()=>void,ms:number)=>setTimeout(cb,ms)),
   clearTimeoutImpl:schedulerInput.clearTimeoutImpl??((handle:unknown)=>clearTimeout(handle as ReturnType<typeof setTimeout>)),
  }
  const schedulerHost=hostServices(dispatch,{now:()=>schedulerReceiver.now(),log:(level,msg,meta)=>schedulerReceiver.log(level,msg,meta),after:(cb,ms)=>schedulerReceiver.setTimeoutImpl(cb,ms),clearAfter:handle=>schedulerReceiver.clearTimeoutImpl(handle)})
  const leaderReceiver=Object.create(LeaderElection.prototype) as LeaderElection
  Object.defineProperty(leaderReceiver,'runtime',{get:()=>this.runtime})
  const leaderHost=Object.assign(leaderReceiver,{metaStore,kind:opts.kind,pid:opts.pid,heartbeatIntervalMs:opts.leader?.heartbeatIntervalMs??30000,lockTtlMs:opts.leader?.lockTtlMs??90000,now:opts.now??opts.leader?.now??(()=>Date.now()),log:owner.log,scheduleInterval:opts.leader?.scheduleInterval??((cb:()=>void,ms:number)=>setInterval(cb,ms)),clearIntervalImpl:opts.leader?.clearInterval??((handle:unknown)=>clearInterval(handle as ReturnType<typeof setInterval>))})
  const base=Layer.mergeAll(
   hostLayers(dispatch,{now:()=>owner.now(),log:(level,msg,meta)=>owner.log(level,msg,meta)}),
   Layer.succeed(SubscriptionQueue,SubscriptionQueue.of({
    enqueue:context=>promise(()=>owner.enqueueItem(context as EnqueueItemContext)),
    historyContains:url=>sync(()=>owner.isHistoryDup(url as string)),
    taskLookupAvailable:owner.taskExists!==null,
    taskExists:id=>owner.taskExists===null?Effect.succeed(true):promise(()=>Promise.resolve(owner.taskExists!(id))),
   })),
   Layer.succeed(SubscriptionDates,SubscriptionDates.of({parse:value=>sync(()=>{const time=Date.parse(value as string);return Number.isNaN(time)?null:time})})),
   Layer.succeed(LegacyTiming,LegacyTiming.of({turn:()=>Effect.callback(resume=>{queueMicrotask(()=>resume(Effect.void))})})),
  )
  const policyHistory=Layer.succeed(SubscriptionPolicyHistory,SubscriptionPolicyHistory.of({contains:url=>sync(()=>{const callback=owner.isHistoryDup;return callback(url as string)})}))
  const schedulerSettings=Layer.succeed(SubscriptionSchedulerSettings,SubscriptionSchedulerSettings.of({intervalMs:sync(()=>schedulerReceiver.intervalMs),dedupeMs:sync(()=>schedulerReceiver.refreshDedupeWindowMs)}))
  const schedulerOverrides=Layer.succeed(SubscriptionSchedulerHost,SubscriptionSchedulerHost.of({timers:schedulerHost.timers,log:schedulerHost.log}))
  const storeLayer=Layer.succeed(SubscriptionStore,SubscriptionStore.of({
   list:promise(()=>owner.store.list()),get:id=>promise(()=>owner.store.get(id)),findDuplicateFeed:(url,id)=>promise(()=>owner.store.findDuplicateFeed(url,id)),
   add:input=>promise(()=>owner.store.add(input)),update:(id,patch)=>promise(()=>owner.store.update(id,patch as SubscriptionUpdateInput&Partial<SubscriptionRule>)),
   remove:id=>promise(()=>owner.store.remove(id)),replaceItems:(id,items)=>promise(()=>owner.store.replaceItems(id,items as NormalizedFeedItem[])),
   mergeItems:(id,items)=>promise(()=>owner.store.mergeItems(id,items)),markItemQueued:(id,item,task)=>promise(()=>owner.store.markItemQueued(id,item,task)),
   clearQueueLinks:selector=>promise(()=>owner.store.clearQueueLinks(selector)),
   // This API bridge always receives its own task lookup. Pass the original
   // callback through so the store's synchronous/Promise adoption stays exact.
   clearOrphanedQueueLinks:()=>promise(()=>owner.store.clearOrphanedQueueLinks(owner.taskExists??(()=>true))),
  }))
  const metaLayer=Layer.succeed(SubscriptionMeta,SubscriptionMeta.of({
   readLeader:promise(()=>leaderHost.metaStore.readLeader()),casLeader:request=>promise(()=>leaderHost.metaStore.casLeader(request)),
   readPreferred:promise(()=>leaderHost.metaStore.readPreferred()),writePreferred:kind=>promise(()=>leaderHost.metaStore.writePreferred(kind)),
  }))
  const leader=leaderLayer({kind:opts.kind,pid:opts.pid,heartbeatIntervalMs:opts.leader?.heartbeatIntervalMs,lockTtlMs:opts.leader?.lockTtlMs}).pipe(Layer.provide(Layer.mergeAll(
   metaLayer,hostLayers(dispatch,{now:()=>leaderHost.now(),log:(level,msg,meta)=>leaderHost.log(level,msg,meta),every:(cb,ms)=>leaderHost.scheduleInterval(cb,ms),clearEvery:handle=>leaderHost.clearIntervalImpl(handle)}),
   Layer.succeed(LeaderStateSink,LeaderStateSink.of({emit:()=>Effect.void})),
  )))
  const checkLayer=Layer.succeed(CheckCancellation,CheckCancellation.of({make:Effect.sync(()=>{
   const controller=new AbortController()
   const borrowed=signals.borrow(controller.signal)
   return {cancellation:borrowed.token,aborted:Effect.sync(()=>controller.signal.aborted),cancel:sync(()=>controller.abort())}
  })}))
  const dependencies=Layer.mergeAll(base,storeLayer,leader,policyHistory,schedulerSettings,schedulerOverrides,
   Layer.succeed(SubscriptionFeed,SubscriptionFeed.of({fetch:url=>promise(()=>owner.fetcher.fetch(url)),probe:()=>{throw new Error('Injected FeedFetcher does not expose probe')}})),
   Layer.succeed(ProfileFeed,ProfileFeed.of({configured:profileFetcher!==null,available:Boolean(profileFetcher),fetch:(subscription,token)=>promise(()=>profileFetcher!.fetch(subscription as SubscriptionRule,signals.signalFor(token.cancellation)))})),
   checkLayer,policyLayer.pipe(Layer.provide(Layer.mergeAll(base,policyHistory))),eventsLayer.pipe(Layer.provide(base)),
  )
  this.runtime=ManagedRuntime.make(apiLayer(opts.scheduler??{}).pipe(
   Layer.provideMerge(dependencies),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true)),
  ))
  this.runtime.runSync(Effect.void)
 }
 private effect<A,E>(read:(owner:NativeApi['Service'])=>Effect.Effect<A,E>):Promise<A>{return runLegacyPromise(this.runtime,Effect.flatMap(NativeApi,read),legacyError)}
 on(_event:SubscriptionsApiEvent,listener:SubscriptionsApiListener):()=>void{
  let entry=this.sinks.find(entry=>entry.listener===listener)
  if(entry===undefined){entry={listener,sink:{emit:()=>sync(()=>listener('changed'))}};this.sinks.push(entry)}
  const cancel=runLegacySync(this.runtime,Effect.flatMap(NativeApi,owner=>owner.on(entry!.sink)),legacyError)
  return ()=>runLegacySync(this.runtime,cancel,legacyError)
 }
 start():Promise<void>{return this.effect(owner=>owner.start)}
 stop():Promise<void>{return this.effect(owner=>owner.stop)}
 isLeader():boolean{return runLegacySync(this.runtime,Effect.flatMap(NativeApi,owner=>owner.isLeader),legacyError)}
 observeLeader():Promise<LeaderState>{return this.effect(owner=>owner.observeLeader)}
 resolve(input:{rawUrl:string}):ResolvedFeed{return runLegacySync(this.runtime,Effect.flatMap(NativeApi,owner=>owner.resolve(input)),legacyError)}
 list():Promise<{items:SubscriptionWithItems[];total:number}>{return this.effect(owner=>owner.list) as Promise<{items:SubscriptionWithItems[];total:number}>}
 get(input:{id:string}):Promise<SubscriptionWithItems>{return this.effect(owner=>owner.get(input)) as Promise<SubscriptionWithItems>}
 add(input:SubscriptionCreateInput):Promise<SubscriptionWithItems>{return this.effect(owner=>owner.add(input)) as Promise<SubscriptionWithItems>}
 update(input:{id:string}&SubscriptionUpdateInput):Promise<SubscriptionWithItems>{return this.effect(owner=>owner.update(input)) as Promise<SubscriptionWithItems>}
 remove(input:{id:string}):Promise<Record<string,never>>{return this.effect(owner=>owner.remove(input))}
 refresh(input:{id:string}):Promise<SubscriptionWithItems>{return this.effect(owner=>owner.refresh(input)) as Promise<SubscriptionWithItems>}
 itemsList(input:{subscriptionId:string;limit?:number;offset?:number}):Promise<{items:SubscriptionFeedItem[];total:number}>{return this.effect(owner=>owner.itemsList(input))}
 itemsQueue(input:{subscriptionId:string;itemId:string},creation?:TaskCreationMetadata):Promise<{queued:boolean;taskId:string|null}>{return this.effect(owner=>owner.itemsQueue(input,creation))}
 releaseRemovedTasks(taskIds:readonly string[]):Promise<number>{return this.effect(owner=>owner.releaseRemovedTasks(taskIds))}
 reconcileOrphanedTasks():Promise<number>{return this.effect(owner=>owner.reconcileOrphanedTasks)}
 refreshAll(options?:{force?:boolean}):Promise<void>{return this.effect(owner=>owner.refreshAll(options))}
 refreshOne(id:string):Promise<void>{return this.effect(owner=>owner.refreshOne(id))}
 noteTaskRemoved(id:string):void{runLegacySync(this.runtime,Effect.flatMap(NativeApi,owner=>owner.noteTaskRemoved(id)),legacyError)}
}
