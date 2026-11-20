import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {MinimalModelFill,MinimalFillSchedule,MinimalFillHooks} from '../../transcription/src/MinimalModelFill.service'
import {layer} from '../../transcription/src/MinimalModelFill.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {modelsLayerFor} from './model-manager'
import type {ModelManager} from './model-manager'
import {transcriptionCause} from './bridge/errors'
export interface MinimalModelFillOptions {
 models:ModelManager
 now?:()=>number
 schedule?:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>
 delaysMs?:readonly number[]
 logger?:{info?:(message:string)=>void;warn?:(message:string,err?:unknown)=>void}
 onReady?:()=>void
}
export const startMinimalModelFill=(opts:MinimalModelFillOptions):{stop:()=>void}=>{
 let runtime:ManagedRuntime.ManagedRuntime<MinimalModelFill,never>
 const run=<A,E>(action:Effect.Effect<A,E,MinimalModelFill>):A=>runLegacySync(runtime,action,transcriptionCause)
 const failure=(cause:unknown)=>HostFailure.make({operation:'minimal-fill-hook',legacyMessage:'minimal fill hook failed',cause})
 const schedule=opts.schedule??((fn,ms)=>setTimeout(fn,ms))
 const timers=Layer.succeed(MinimalFillSchedule,{schedule:(action,ms)=>Effect.try({try:()=>{const token=schedule(()=>run(action),ms);return {truthy:Boolean(token),cancel:Effect.sync(()=>clearTimeout(token))}},catch:failure})})
 const hooks=Layer.succeed(MinimalFillHooks,{ready:Effect.try({try:()=>{opts.logger?.info?.('transcription: minimal model set ready');opts.onReady?.()},catch:failure}),failed:error=>Effect.try({try:()=>opts.logger?.warn?.('transcription: minimal model fill failed, will retry',error),catch:failure})})
 const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
 const services=layer.pipe(Layer.provide(modelsLayerFor(opts.models,action=>run(action))),Layer.provide(timers),Layer.provide(hooks),Layer.provide(timing))
 runtime=ManagedRuntime.make(Layer.merge(services,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
 const fill=run(Effect.flatMap(MinimalModelFill,service=>service.start(opts.delaysMs===undefined?undefined:{delaysMs:opts.delaysMs})))
 return {stop:()=>run(fill.stop)}
}
