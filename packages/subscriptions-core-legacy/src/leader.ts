/**
 * Feed-check leader election.
 *
 * Spec: NEX-132 issue body, "Phase A · feed-check leader 选举".
 *
 *   - Multiple hosts (today: Desktop and Web/API) share one SQLite file in
 *     co-located deployments. Both can run their own feed-check loop, but
 *     only one is allowed to do the scheduled work; otherwise we pull the
 *     same RSS feed twice.
 *   - Leadership is a soft lease in `subscriptions_meta`. A host calls
 *     `tryAcquire()` at startup; if it wins it calls `heartbeat()` every
 *     30s to refresh `leader_lock_expires_at = now + 90s`. If the lease
 *     ages past `leader_lock_expires_at` any host may steal it.
 *   - Each acquisition uses a fresh `lease_id` (random ULID). Heartbeats and
 *     releases require the same `lease_id`; otherwise CAS fails and the
 *     caller treats itself as no longer the leader.
 *   - There is a soft preference (`preferred_leader`) the operator can set;
 *     a non-preferred host will refuse to steal a fresh lease from the
 *     preferred host but will steal an *expired* one regardless.
 *
 * The election is implemented over a `MetaStore` interface so hosts can
 * swap the backing store. `createSqliteMetaStore` (in ./store.ts) wraps
 * the real `subscriptions_meta` table.
 */
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacyPromise,runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {SubscriptionLeader as NativeLeader,LeaderStateSink} from '@vidbee/subscriptions-core/SubscriptionLeader.service'
import {SubscriptionMeta} from '@vidbee/subscriptions-core/SubscriptionMeta.service'
import {layer as leaderLayer} from '@vidbee/subscriptions-core/SubscriptionLeader.layer'
import {hostLayers,promise,sync,legacyError} from './Host.driver.js' 
import {
  DEFAULT_LEADER_HEARTBEAT_MS,DEFAULT_LEADER_LOCK_TTL_MS,
  type LeaderAcquireOptions,
  type LeaderKind,
  type LeaderState
} from './types.js'

export interface MetaStore {
  /**
   * Read all leader-related meta keys in a single transaction. Returning a
   * partial map (missing keys when the row doesn't exist) is fine.
   */
  readLeader(): Promise<LeaderState>
  /**
   * Compare-and-swap the leader rows. Implementations MUST run the read and
   * write inside one SQLite transaction (or equivalent). Returns true on
   * success; false if the current state no longer matches `expectedLeaseId`.
   *
   * The semantics are:
   *   - if `expectedLeaseId` is null, succeed when the stored `leaseId` is
   *     null OR the lease has expired (<= now). This is the "acquire fresh
   *     lease" path.
   *   - otherwise, succeed only if the stored `leaseId === expectedLeaseId`.
   *     This is the "renew/release my lease" path.
   */
  casLeader(args: {
    expectedLeaseId: string | null
    now: number
    next: Pick<
      LeaderState,
      'kind' | 'pid' | 'startedAt' | 'heartbeatAt' | 'lockExpiresAt' | 'leaseId'
    >
  }): Promise<boolean>
  /** Read the operator-set preference; nullable. */
  readPreferred(): Promise<LeaderKind | null>
  /** Write the operator-set preference. */
  writePreferred(kind: LeaderKind | null): Promise<void>
}

export interface LeaderElectionOptions extends LeaderAcquireOptions {
  metaStore: MetaStore
  /**
   * Optional logger. Default is no-op so the package stays Electron / log
   * runtime free; hosts wire `electron-log` / `pino` etc.
   */
  log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void
  /**
   * Called whenever the lease state visibly changes (acquired, lost, stolen,
   * heartbeat-failed). Hosts use this to start/stop their feed-check timer.
   */
  onStateChange?: (state: LeaderState, isLeader: boolean) => void
  /**
   * Schedule helpers. Default to `setInterval` / `clearInterval`. Tests
   * inject fake timers.
   */
  scheduleInterval?: (cb: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
}

export class LeaderElection {
 private readonly runtime: ManagedRuntime.ManagedRuntime<NativeLeader,never>
 constructor(options:LeaderElectionOptions){
  const captured={metaStore:options.metaStore,kind:options.kind,pid:options.pid,heartbeatIntervalMs:options.heartbeatIntervalMs??DEFAULT_LEADER_HEARTBEAT_MS,lockTtlMs:options.lockTtlMs??DEFAULT_LEADER_LOCK_TTL_MS,now:options.now??(()=>Date.now()),log:options.log??(()=>undefined),onStateChange:options.onStateChange,scheduleInterval:options.scheduleInterval??((cb:()=>void,ms:number)=>setInterval(cb,ms)),clearIntervalImpl:options.clearInterval??((handle:unknown)=>clearInterval(handle as ReturnType<typeof setInterval>))}
  const owner=Object.assign(this,captured)
  const dependencies=Layer.mergeAll(
   hostLayers(operation=>{void runLegacyPromise(this.runtime,operation,legacyError)}, {
    now:()=>owner.now.call(owner),log:(...args)=>owner.log.call(owner,...args),every:(cb,ms)=>owner.scheduleInterval.call(owner,()=>{if(owner.heartbeat===LeaderElection.prototype.heartbeat)cb();else void owner.heartbeat()},ms),clearEvery:handle=>owner.clearIntervalImpl.call(owner,handle),
   }),
   Layer.succeed(SubscriptionMeta,SubscriptionMeta.of({
    readLeader:promise(()=>owner.metaStore.readLeader()),
    casLeader:request=>promise(()=>owner.metaStore.casLeader(request)),
    readPreferred:promise(()=>owner.metaStore.readPreferred()),
    writePreferred:kind=>promise(()=>owner.metaStore.writePreferred(kind)),
   })),
   Layer.succeed(LeaderStateSink,LeaderStateSink.of({emit:(state,leader)=>sync(()=>owner.onStateChange?.call(owner,state,leader))})),
  )
  this.runtime=ManagedRuntime.make(leaderLayer({kind:captured.kind,pid:captured.pid,heartbeatIntervalMs:captured.heartbeatIntervalMs,lockTtlMs:captured.lockTtlMs}).pipe(
   Layer.provide(dependencies),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true)),
  ))
  this.runtime.runSync(Effect.void)
 }
 isLeader():boolean{return runLegacySync(this.runtime,Effect.flatMap(NativeLeader,owner=>owner.isLeader),legacyError)}
 tryAcquire():Promise<{acquired:boolean;state:LeaderState}>{return runLegacyPromise(this.runtime,Effect.flatMap(NativeLeader,owner=>owner.tryAcquire),legacyError)}
 heartbeat():Promise<boolean>{return runLegacyPromise(this.runtime,Effect.flatMap(NativeLeader,owner=>owner.heartbeat),legacyError)}
 release():Promise<void>{return runLegacyPromise(this.runtime,Effect.flatMap(NativeLeader,owner=>owner.release),legacyError)}
 observe():Promise<LeaderState>{return runLegacyPromise(this.runtime,Effect.flatMap(NativeLeader,owner=>owner.observe),legacyError)}
}
