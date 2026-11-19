/**
 * Periodic feed-check loop. Host-neutral.
 *
 *   - When the host holds the leader lease the loop fires every
 *     `intervalMs` (default 3h) and calls `runOnce()`.
 *   - `triggerNow(id?)` runs immediately regardless of leader state. The
 *     caller (any host) is allowed to do this in response to user action;
 *     concurrency is gated with a 30s `refreshDedupeWindowMs` so two hosts
 *     can't both refresh the same subscription within a short window.
 *   - `runOnce()` is provided by the host. Hosts implement the per-feed
 *     work (parse → decideAutoDownloads → enqueue via task-queue) inside
 *     this callback; the scheduler only owns the timing and the leader
 *     gating.
 *
 * The scheduler does NOT implement retry. yt-dlp retry is the task-queue's
 * concern (NEX-129), and feed parse errors are reported on the subscription
 * row (`status='failed'`, `lastError`) for the next periodic run to retry.
 */
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {runLegacyPromise,runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {SubscriptionScheduler as NativeScheduler,SchedulerWork,SubscriptionSchedulerSettings} from '@vidbee/subscriptions-core/SubscriptionScheduler.service'
import {layer as schedulerLayer} from '@vidbee/subscriptions-core/SubscriptionScheduler.layer'
import {DEFAULT_FEED_CHECK_INTERVAL_MS,DEFAULT_REFRESH_DEDUPE_WINDOW_MS} from './types.js'
import {hostLayers,promise,sync,legacyError} from './Host.driver.js' 

export interface FeedCheckSchedulerOptions {
  /**
   * Run the periodic feed-check pass over all enabled subscriptions, or one
   * if `subscriptionId` is given. Hosts implement this; the scheduler only
   * decides when to call.
   */
  runAll: () => Promise<void>
  runOne: (subscriptionId: string) => Promise<void>
  /**
   * Returns true if this host currently holds the leader lease.
   *
   * The scheduler reads this every tick rather than caching, so a leader
   * loss between ticks is honored without needing the `LeaderElection`
   * instance to feed events into here.
   */
  isLeader: () => boolean
  /** Default 3h. */
  intervalMs?: number
  /**
   * Window during which a duplicate `triggerNow(id)` is dropped. Default 30s
   * (matches NEX-132 spec for cross-host refresh dedupe).
   */
  refreshDedupeWindowMs?: number
  /** Default `setTimeout`. */
  setTimeoutImpl?: (cb: () => void, ms: number) => unknown
  clearTimeoutImpl?: (handle: unknown) => void
  now?: () => number
  log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void
}

export class FeedCheckScheduler {
 private readonly runtime:ManagedRuntime.ManagedRuntime<NativeScheduler,never>
 constructor(options:FeedCheckSchedulerOptions){
  const captured={
   runAll:options.runAll,runOne:options.runOne,isLeader:options.isLeader,
   intervalMs:options.intervalMs??DEFAULT_FEED_CHECK_INTERVAL_MS,refreshDedupeWindowMs:options.refreshDedupeWindowMs??DEFAULT_REFRESH_DEDUPE_WINDOW_MS,
   setTimeoutImpl:options.setTimeoutImpl??((cb:()=>void,ms:number)=>setTimeout(cb,ms)),
   clearTimeoutImpl:options.clearTimeoutImpl??((handle:unknown)=>clearTimeout(handle as ReturnType<typeof setTimeout>)),
   now:options.now??(()=>Date.now()),log:options.log??(()=>undefined),
  }
  const dependencies=Layer.mergeAll(
   Layer.succeed(SubscriptionSchedulerSettings,SubscriptionSchedulerSettings.of({intervalMs:sync(()=>captured.intervalMs),dedupeMs:sync(()=>captured.refreshDedupeWindowMs)})),
   hostLayers(operation=>{void runLegacyPromise(this.runtime,operation,legacyError)}, {
    now:()=>captured.now(),log:(level,msg,meta)=>captured.log(level,msg,meta),after:(cb,ms)=>captured.setTimeoutImpl(cb,ms),clearAfter:handle=>captured.clearTimeoutImpl(handle),
   }),
   Layer.succeed(SchedulerWork,SchedulerWork.of({
    runAll:promise(()=>captured.runAll()),runOne:id=>promise(()=>captured.runOne(id)),isLeader:sync(()=>captured.isLeader()),
   })),
   Layer.succeed(LegacyTiming,LegacyTiming.of({turn:()=>Effect.callback(resume=>{queueMicrotask(()=>resume(Effect.void))})})),
  )
  this.runtime=ManagedRuntime.make(schedulerLayer({intervalMs:captured.intervalMs,refreshDedupeWindowMs:captured.refreshDedupeWindowMs}).pipe(
   Layer.provide(dependencies),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true)),
  ))
  this.runtime.runSync(Effect.void)
 }
 start(initialDelayMs?:number):void{runLegacySync(this.runtime,Effect.flatMap(NativeScheduler,owner=>owner.start(initialDelayMs)),legacyError)}
 stop():void{runLegacySync(this.runtime,Effect.flatMap(NativeScheduler,owner=>owner.stop),legacyError)}
 triggerNow(subscriptionId?:string):Promise<void>{return runLegacyPromise(this.runtime,Effect.flatMap(NativeScheduler,owner=>owner.triggerNow(subscriptionId)),legacyError)}
}
