import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import type { Executor, ExecutorEvents, ExecutorRun } from '@vidbee/task-queue-legacy'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
import { ProfileExecutorDependencies } from '../../browser-capture/src/ProfileExecutor.service.js'
import { ProfileExecutorLive } from '../../browser-capture/src/ProfileExecutor.layer.js'
import type { TransferSink } from '../../browser-capture/src/BrowserProfiles.service.js'
import type { BrowserProfileAdapter } from '../../browser-capture/src/onlyfans-profile.js'
import { makeCapturePlatformLayer } from './CapturePlatform.layer.js'
import { executorBridge, executorSink } from './executor-bridge.js'
import { captureError } from './errors.js'
interface ProfileManager {
  readonly adapter: BrowserProfileAdapter
  readonly download: (profileUrl:string,mediaId:string,destination:string,signal:AbortSignal,progress:(bytes:number,total:number)=>void)=>Promise<{filePath:string;size:number}>
}
const failure = (operation:string,cause:unknown) => HostFailure.make({operation,cause,legacyMessage:cause instanceof Error ? cause.message : String(cause)})
const promise = <A>(operation:string,body:()=>Promise<A>) => Effect.callback<A,HostFailure>(resume=> {
  try { body().then(value=>resume(Effect.succeed(value)),cause=>resume(Effect.fail(failure(operation,cause)))) }
  catch(cause) {resume(Effect.fail(failure(operation,cause)))}
})
export const makeProfileExecutorRuntime = (profiles:ProfileManager,fallback:Executor,defaultDirectory:()=>string):ManagedRuntime.ManagedRuntime<TaskExecutor,never> => {
  let owner:ManagedRuntime.ManagedRuntime<TaskExecutor,never>
  const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
  const platform=makeCapturePlatformLayer(()=>owner,captureError).pipe(Layer.provideMerge(timing))
  const dependencies=Layer.succeed(ProfileExecutorDependencies,{
    name:()=>profiles.adapter.name,
    matches:url=>Effect.try({try:()=>profiles.adapter.isSite(url),catch:cause=>failure('profile route',cause)}),
    defaultDirectory:Effect.try({try:defaultDirectory,catch:cause=>failure('default directory',cause)}),
    fallback:executorBridge(fallback,()=>owner,captureError),
    attempt:effect=>Effect.sync(()=> {
      const done=runLegacyPromise(owner,effect,captureError)
      return {wait: promise('profile attempt',()=>done)}
    }),
    download:(profileUrl,mediaId,destination,signal,sink:TransferSink)=>promise('profile download',()=>profiles.download(profileUrl,mediaId,destination,signal,(bytes,total)=>runLegacySync(owner,sink.emit(bytes,total),captureError)))
  })
  owner=ManagedRuntime.make(ProfileExecutorLive.pipe(Layer.provide(Layer.merge(platform,dependencies)),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true))))
  owner.runSync(Effect.void)
  return owner
}

/** Retain the raw fallback handle and callbacks at the legacy boundary. */
export const makeProfileExecutorFacade = (profiles:ProfileManager,fallback:Executor,defaultDirectory:()=>string):Executor => {
  const frames:Array<{events:ExecutorEvents;fallback?:ExecutorRun}> = []
  const runtime=makeProfileExecutorRuntime(profiles,{run:(ctx,events)=> {
    const frame=frames.at(-1)
    const handle=fallback.run(ctx,frame?.events ?? events)
    if(frame)frame.fallback=handle
    return handle
  }},defaultDirectory)
  return {run:(ctx,events)=> {
    const frame:{events:ExecutorEvents;fallback?:ExecutorRun}={events}
    frames.push(frame)
    try {
      const handle=runLegacySync(runtime,Effect.flatMap(TaskExecutor,executor=>executor.run(ctx,executorSink(events))),captureError)
      return frame.fallback ?? {cancel:timeout=>runLegacyPromise(runtime,handle.cancel(timeout),captureError),pause:()=>runLegacyPromise(runtime,handle.pause,captureError)}
    } finally {frames.pop()}
  }}
}
