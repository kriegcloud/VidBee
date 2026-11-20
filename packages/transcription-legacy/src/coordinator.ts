import {DetachedFailures} from "../../transcription/src/DetachedFailures.service"
import * as Effect from 'effect/Effect'
import * as Cause from 'effect/Cause'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {Coordinator,CoordinatorHooks} from '../../transcription/src/Coordinator.service'
import {layer as coordinatorLayer} from '../../transcription/src/Coordinator.layer'
import {layer as enqueueLayer} from '../../transcription/src/Enqueue.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {TranscriptionFilesLegacySync} from './host/files'
import {queueLayerFor,recordsLayerFor} from './bridge/orchestration-services'
import {transcriptionCause} from './bridge/errors' 
import {
  type Task,
  type TaskQueueAPI,
} from '@vidbee/task-queue-legacy'
import type { TranscriptionProvider } from './cloud'

import type { MemoryTranscriptStore } from './memory-store'
import type { TranscriptStore } from './transcript-store'

export interface ImportCaptionsRequest {
  downloadTaskId: string
  sourceFilePath: string
  title?: string
}

export interface AutoTranscriptionCoordinatorOptions {
  queue: TaskQueueAPI
  store: TranscriptStore | MemoryTranscriptStore
  isEnabled: () => boolean
  resolveSourceFile: (task: Task) => string | null
  resolveAsrTier?: () => string
  resolveProvider?: () => TranscriptionProvider
  resolveCloudModelId?: () => string
  /** UI language. Only Simplified vs Traditional Chinese is kept as a post-ASR script preference. */
  resolveLanguage?: () => string
  /** Import embedded or sidecar captions. Return true when a transcript was stored. */
  tryImportCaptions?: (input: ImportCaptionsRequest) => Promise<boolean>
  /** When false, live completions wait until `flushPending()` after models land. */
  isModelsReady?: () => boolean
  logger?: { warn: (...args: unknown[]) => void }
}

export class AutoTranscriptionCoordinator {
 private readonly runtime:ManagedRuntime.ManagedRuntime<Coordinator,never>
 constructor(opts:AutoTranscriptionCoordinatorOptions){
  let runtime:ManagedRuntime.ManagedRuntime<Coordinator,never>
  const run=<A,E>(effect:Effect.Effect<A,E,Coordinator>):A=>runLegacySync(runtime,effect,transcriptionCause)
  const failure=(cause:unknown)=>HostFailure.make({operation:'coordinator-hook',legacyMessage:'Coordinator hook failed',cause})
  const hooks=Layer.succeed(CoordinatorHooks,{
   source:task=>Effect.try({try:()=>opts.resolveSourceFile(task),catch:failure}),
   enabled:Effect.try({try:()=>opts.isEnabled(),catch:failure}),
   get modelsReady(){return opts.isModelsReady===undefined?undefined:Effect.try({try:()=>{const callback=opts.isModelsReady;return callback===undefined?true:callback.call(opts)},catch:failure})},
   get importCaptions(){return opts.tryImportCaptions===undefined?undefined:(input:ImportCaptionsRequest)=>Effect.tryPromise({try:()=>{const callback=opts.tryImportCaptions;return callback===undefined?Promise.resolve(false):callback.call(opts,{downloadTaskId:input.downloadTaskId,sourceFilePath:input.sourceFilePath,title:input.title})},catch:failure})},
   enqueueInput:(task,source)=>Effect.try({try:()=>({downloadTaskId:task.id,sourceFilePath:source,title:task.input.title,trigger:'auto' as const,provider:opts.resolveProvider?.(),cloudModelId:opts.resolveCloudModelId?.(),asrTier:opts.resolveAsrTier?.(),language:opts.resolveLanguage?.()}),catch:failure}),
   warn:(message,error)=>Effect.try({try:()=>opts.logger?.warn(message,transcriptionCause(Cause.fail(error))),catch:failure}),
  })
  const borrowed=Layer.mergeAll(queueLayerFor(opts.queue,action=>run(action)),recordsLayerFor(opts.store),TranscriptionFilesLegacySync)
  const enqueues=enqueueLayer.pipe(Layer.provideMerge(borrowed))
  const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
  const services=coordinatorLayer.pipe(Layer.provide(Layer.succeed(DetachedFailures,{listener:cause=>Effect.die(transcriptionCause(cause)),rejection:cause=>Effect.sync(()=>{void Promise.reject(transcriptionCause(cause))})})),Layer.provide(enqueues),Layer.provide(hooks),Layer.provide(timing))
  runtime=ManagedRuntime.make(Layer.merge(services,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
  run(Coordinator)
  this.runtime=runtime
 }
 start():void{runLegacySync(this.runtime,Effect.flatMap(Coordinator,service=>service.start),transcriptionCause)}
 stop():void{runLegacySync(this.runtime,Effect.flatMap(Coordinator,service=>service.stop),transcriptionCause)}
 flushPending():Promise<void>{return runLegacyPromise(this.runtime,Effect.flatMap(Coordinator,service=>service.flushPending),transcriptionCause)}
}
