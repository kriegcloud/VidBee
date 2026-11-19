import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import * as Logger from '@vidbee/logger'
import { TaskQueue } from '@vidbee/task-queue/TaskQueue.service'
import { layer as queueLayer, internalLayers } from '@vidbee/task-queue/TaskQueue.layer'
import { layer as storeLayer } from '@vidbee/task-queue/TaskStore.layer'
import { layer as eventsLayer } from '@vidbee/task-queue/TaskEvents.layer'
import { TaskPersistence } from '@vidbee/task-queue/TaskPersistence.service'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import { QueueTimers } from '@vidbee/task-queue/QueueTimers.service'
import { QueueRandom } from '@vidbee/task-queue/QueueRandom.service'
import { OutputProbe } from '@vidbee/task-queue/OutputProbe.service'
import { ProcessControl } from '@vidbee/task-queue/ProcessControl.service'
import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import { layerFromShared, makeState } from '@vidbee/task-queue/SourceAdmission.layer'
import { HostFailure } from '@vidbee/task-queue/TaskQueue.errors'
import { legacyError } from '../bridge/errors.js'
import { runLegacyPromise, runLegacySync } from '../bridge/runtime.js'
import type { Executor } from '../executor/index.js'
import type { PersistAdapter } from '../persist/adapter.js'
import { isPidAlive, readPidStartTime } from '../process/pid-start-time.js'
import { killProcessTree } from '../process/kill-process-tree.js'
import type { SourceAdmission } from '../source-admission.js'
import type { TaskQueueEvent,TaskQueueListener } from '../events/index.js'
import type { Task,TaskKind,TaskStatus,TaskInput,TaskOutput,TaskPriority,TaskProgress,ClassifiedError } from '../types.js'
export interface TaskQueueAPIOptions {
  admission?: SourceAdmission
  persist: PersistAdapter
  executor: Executor
  /** Defaults to 4 — the production default for desktop and web. */
  maxConcurrency?: number
  /** Default per-group cap. Null = unlimited. */
  defaultMaxPerGroup?: number | null
  /** Test seam; defaults to Date.now. */
  clock?: () => number
  /** Test seam for setTimeout (Watchdog + RetryScheduler). */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /**
   * For `processing -> completed` we hard-guard `output.filePath` exists.
   * Test seam.
   */
  filePresent?: (path: string) => boolean
  /** Watchdog idle thresholds. */
  runningIdleMs?: number
  processingIdleMs?: number
  /** Random source for backoff jitter. Test seam. */
  rng?: () => number
  /** Process kill function for ProcessRegistry. Test seam. */
  killProcess?: (pid: number, signal: 'SIGTERM' | 'SIGKILL') => void
  /**
   * How often to look for queued work with no live runner. `0` disables the
   * timer (tests). Default 15s.
   */
  idleQueueKickMs?: number
  /**
   * Running/processing tasks younger than this are not treated as zombies.
   * Default 8s.
   */
  zombieRunningMs?: number
}

export interface ImportCompletedRequest {
  input: TaskInput
  output: TaskOutput
  /**
   * Optional caller-supplied identifier. Idempotent: re-importing an existing
   * id returns `{ id, created: false }` without rewriting the task.
   */
  id?: string
  groupKey?: string
}

export interface AddTaskRequest {
  input: TaskInput
  priority?: TaskPriority
  groupKey?: string
  parentId?: string | null
  maxAttempts?: number
  /**
   * Optional caller-supplied identifier. When the host has already minted an
   * id (e.g. desktop renderer optimistic UI before the IPC round-trip) it
   * should be threaded through so the resulting `task.id` matches and the
   * caller does not see two separate rows in the list — the optimistic one
   * and the kernel-generated one. If omitted, a random UUID is generated.
   * Idempotency: re-adding with an existing id returns `{id}` without
   * re-creating the task.
   */
  id?: string
}

export interface ListOptions {
  query?: string
  kind?: TaskKind
  status?: TaskStatus
  groupKey?: string
  parentId?: string
  limit?: number
  cursor?: string | null
}


export class TaskQueueAPI {
 private readonly service:typeof TaskQueue.Service
 private readonly sync:<A,E>(effect:Effect.Effect<A,E>)=>A
 private readonly promise:<A,E>(effect:Effect.Effect<A,E>)=>Promise<A>
 constructor(opts:TaskQueueAPIOptions) {
  const host=(original:unknown)=>HostFailure.make({original,legacyMessage:String(original)})
  const call=<A>(fn:()=>PromiseLike<A>)=>Effect.tryPromise({try:fn,catch:host})
  const persist=TaskPersistence.of({
   hasTask:id=>call(()=>opts.persist.hasTask(id)),insertTask:task=>call(()=>opts.persist.insertTask(task)),upsertTask:input=>call(()=>opts.persist.upsertTask(input)),upsertTasks:inputs=>call(()=>opts.persist.upsertTasks(inputs)),upsertProgress:(id,p)=>call(()=>opts.persist.upsertProgress(id,p)),deleteTask:id=>call(()=>opts.persist.deleteTask(id)),insertAttempt:input=>call(()=>opts.persist.insertAttempt(input)),closeAttempt:input=>call(()=>opts.persist.closeAttempt(input)),appendJournal:input=>call(()=>opts.persist.appendJournal(input)),findOpenSpawns:call(()=>opts.persist.findOpenSpawns()),loadAllTasks:call(()=>opts.persist.loadAllTasks()),loadLatestAttempt:id=>call(()=>opts.persist.loadLatestAttempt(id)),maintenance:opts.persist.maintenance===undefined?Effect.void:call(()=>opts.persist.maintenance!()),close:opts.persist.close===undefined?Effect.void:call(()=>Promise.resolve(opts.persist.close!())),
  })
  let execute:<A,E>(effect:Effect.Effect<A,E>)=>A=()=>{throw new Error('Queue runtime is not initialized')}
  let fork:(effect:Effect.Effect<void>)=>void=()=>{throw new Error('Queue runtime is not initialized')}
  const filePresent=opts.filePresent??((path:string)=>{try{return existsSync(path)&&statSync(path).size>0}catch{return false}})
  const layers=Layer.mergeAll(storeLayer,eventsLayer,Layer.succeed(TaskPersistence,persist),layerFromShared(opts.admission?.state??makeState()),
   Layer.succeed(QueueTimers,{
    now:Effect.sync(opts.clock??Date.now),sleep:ms=>Effect.callback(resume=>{const h=setTimeout(()=>resume(Effect.void),ms);return Effect.sync(()=>clearTimeout(h))}),
    after:(ms,effect,{keepAlive})=>Effect.sync(()=>{
     const callback=()=>fork(effect)
     const handle=opts.setTimer?opts.setTimer(callback,ms):setTimeout(callback,ms)
     if(!opts.setTimer&&!keepAlive)(handle as ReturnType<typeof setTimeout>).unref?.()
     return Effect.sync(()=>opts.clearTimer?opts.clearTimer(handle):clearTimeout(handle as ReturnType<typeof setTimeout>))
    }),
   }),
   Layer.succeed(QueueRandom,{next:Effect.sync(opts.rng??Math.random),uuid:Effect.sync(randomUUID)}),
   Layer.succeed(OutputProbe,{filePresent:path=>Effect.sync(()=>filePresent(path))}),
   Layer.succeed(ProcessControl,{kill:(pid,signal)=>Effect.try({try:()=>opts.killProcess?opts.killProcess(pid,signal):killProcessTree(pid,signal),catch:host}),isAlive:pid=>Effect.sync(()=>isPidAlive(pid)),startTime:pid=>Effect.sync(()=>readPidStartTime(pid))}),
   Layer.succeed(LegacyTiming,{turn:()=>Effect.callback(resume=>{queueMicrotask(()=>resume(Effect.void))})}),
   Layer.succeed(TaskExecutor,{run:(ctx,sink)=>Effect.try({try:()=>{
    const run=opts.executor.run(ctx,{
     onSpawn:e=>execute(sink.emit({...e,type:'spawn'})),onProgress:e=>execute(sink.emit({...e,type:'progress'})),onProcessing:e=>execute(sink.emit({...e,type:'processing'})),onStd:e=>execute(sink.emit({...e,type:'std'})),onFinish:e=>execute(sink.emit({...e,type:'finish'})),
    })
    return {cancel:timeout=>call(()=>run.cancel(timeout)),pause:call(()=>run.pause())}
   },catch:host})}),Logger.layer,Layer.succeed(Scheduler.PreventSchedulerYield,true))
  const config={...opts,sourceAdmission:opts.admission!==undefined}
  const runtime=ManagedRuntime.make(queueLayer(config).pipe(Layer.provideMerge(internalLayers(config).pipe(Layer.provideMerge(layers)))))
  this.sync=effect=>runLegacySync(runtime,effect,legacyError)
  execute=this.sync
  fork=effect=>{runtime.runFork(effect).addObserver(exit=>{if(Exit.isFailure(exit))runtime.runFork(Effect.logError(exit.cause))})}
  this.service=runtime.runSync(TaskQueue)
  this.promise=effect=>runLegacyPromise(runtime,effect,legacyError)
 }
 start():Promise<void> { return this.promise(this.service.start) }
 stop():Promise<void> { return this.promise(this.service.stop) }
 reconcileQueue():Promise<void> { return this.promise(this.service.reconcileQueue) }
 findDuplicateDownload(input:TaskInput,parentId:string|null=null):Readonly<Task>|undefined { return this.sync(this.service.findDuplicateDownload(input,parentId)) }
 add(req:AddTaskRequest):Promise<{id:string}> { return this.promise(this.service.add(req)) }
 importCompleted(req:ImportCompletedRequest):Promise<{id:string;created:boolean}> { return this.promise(this.service.importCompleted(req)) }
 get(id:string):Readonly<Task>|undefined { return this.sync(this.service.get(id)) }
 hasTask(id:string):Promise<boolean> { return this.promise(this.service.hasTask(id)) }
 rename(id:string,title:string):Promise<void> { return this.promise(this.service.rename(id,title)) }
 relocateFileReferences(from:string,to:string):Promise<void> { return this.promise(this.service.relocateFileReferences(from,to)) }
 list(opts:ListOptions={}):{tasks:Task[];nextCursor:string|null} {
  return this.sync(this.service.list(opts))
 }
 getTaskLog(id:string):Promise<string|null> { return this.promise(this.service.getTaskLog(id)) }
 cancel(id:string,reason="user"):Promise<void> { return this.promise(this.service.cancel(id,reason)) }
 pause(id:string,reason="user"):Promise<void> { return this.promise(this.service.pause(id,reason)) }
 resume(id:string):Promise<void> { return this.promise(this.service.resume(id)) }
 retryManual(id:string,options?:TaskInput["options"]):Promise<void> { return this.promise(this.service.retryManual(id,options)) }
 setMaxConcurrency(n:number):Promise<void> { return this.promise(this.service.setMaxConcurrency(n)) }
 setMaxConcurrentDownloads(n:number):Promise<void> { return this.promise(this.service.setMaxConcurrentDownloads(n)) }
 setMaxPerGroup(key:string,n:number|null):Promise<void> { return this.promise(this.service.setMaxPerGroup(key,n)) }
 removeFromHistory(id:string):Promise<void> { return this.promise(this.service.removeFromHistory(id)) }
 stats() { return this.sync(this.service.stats) }
 subscribe(listener:TaskQueueListener):()=>void { return this.sync(this.service.subscribe(listener)) }
 on<T extends TaskQueueEvent["type"]>(type:T,listener:(e:Extract<TaskQueueEvent,{type:T}>)=>void):()=>void { return this.sync(this.service.on(type,listener)) }
}
export type { ClassifiedError,TaskOutput,TaskProgress }
