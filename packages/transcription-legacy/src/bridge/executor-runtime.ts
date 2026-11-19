import {spawn} from 'node:child_process'
import {rm} from 'node:fs/promises'
import {sep} from 'node:path'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import * as Cause from 'effect/Cause'
import {TaskExecutor} from '@vidbee/task-queue/TaskExecutor.service'
import {HostFailure as QueueHostFailure} from '@vidbee/task-queue/TaskQueue.errors'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {backgroundChildSpawnOptions,lowerChildPriority} from '@vidbee/task-queue-legacy/process'
import {makeProcessCapabilitiesLayer} from '../../../downloader-core-legacy/src/Process.layer'
import {layer as executorLayer} from '../../../transcription/src/TranscriptionExecutor.layer'
import {ExecutorHooks,ExecutorCommit} from '../../../transcription/src/TranscriptionExecutor.service'
import {layer as attemptLayer} from '../../../transcription/src/WorkerAttempt.layer'
import {layer as processLayer} from '../../../transcription/src/TranscriptionProcess.layer'
import {WorkerRuntime,ComputeProvider} from '../../../transcription/src/WorkerRuntime.service'
import {Partials} from '../../../transcription/src/Partials.service'
import {SeedsLive} from '../../../transcription/src/Seeds.layer'
import {SeedStore} from '../../../transcription/src/Seeds.service'
import {SeedFiles} from '../../../transcription/src/SeedFiles.service'
import {WorkerProtocol} from '../../../transcription/src/WorkerProtocol.service'
import {Checkpoints} from '../../../transcription/src/Checkpoints.service'
import {TranscriptionHost} from '../../../transcription/src/TranscriptionHost.service'
import {AudioAbort} from '../../../transcription/src/Audio.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {TranscriptionTime} from '../../../transcription/src/TranscriptionTime.service'
import {TranscriptionFilesLegacySync} from '../host/files'
import {TranscriptionHostLegacy} from '../host/host'
import {legacyTimeLayer} from '../host/time'
import {transcriptionPartials} from '../partial-buffer'
import {getWorkerRuntimeRuntime} from './worker-runtime'
import {getStatelessRuntime} from './stateless'
import {transcriptionCause} from './errors'
import type {TranscriptionExecutorOptions} from '../executor'
export const executorCause=(cause:Cause.Cause<unknown>):unknown=>{const value=Cause.squash(cause);return value instanceof QueueHostFailure?value.original:transcriptionCause(cause)}
const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,legacyMessage:cause instanceof Error?cause.message:String(cause),cause})
export const removeScratch=async(path:string):Promise<void>=>{if(!path.includes(`${sep}vidbee-transcript${sep}`))return;try{await rm(path,{recursive:true,force:true})}catch{}}
export function makeExecutorRuntime(options:TranscriptionExecutorOptions){
 let runtime:ManagedRuntime.ManagedRuntime<TaskExecutor,never>
 const run=<A,E>(effect:Effect.Effect<A,E,TaskExecutor>):A=>runLegacySync(runtime,effect,executorCause)
 const capabilities=makeProcessCapabilitiesLayer(()=>runtime,executorCause,(command,argv,spawnOptions)=>{const child=spawn(command,[...argv],{env:spawnOptions.env,stdio:['pipe','pipe','pipe'],...backgroundChildSpawnOptions()});lowerChildPriority(child.pid);child.stdin?.on('error',()=>{});return child})
 const host=Layer.effect(TranscriptionHost,Effect.map(TranscriptionHost,base=>({...base,lowerPriority:()=>Effect.void}))).pipe(Layer.provide(TranscriptionHostLegacy))
 const time=Layer.effect(TranscriptionTime,Effect.map(TranscriptionTime,base=>({...base,microtask:(action:Effect.Effect<void,HostFailure>)=>Effect.sync(()=>queueMicrotask(()=>{runtime.runFork(action)}))}))).pipe(Layer.provide(legacyTimeLayer(action=>{run(action)})))
 const aborts=Layer.succeed(AudioAbort,{subscribe:(signal,action)=>Effect.sync(()=>{const listener=()=>{runtime.runFork(action)};signal.addEventListener('abort',listener,{once:true});return Effect.sync(()=>signal.removeEventListener('abort',listener))})})
 const callbacks=(sink:import('../../../transcription/src/TranscriptionExecutor.service').InlineExecutionSink)=>({onProgress:(stage:import('../types').TranscriptionStage,percent:number|null)=>{run(sink.progress(stage,percent))},onPartial:(segment:import('../types').PipelineSegment)=>{run(sink.partial(segment))}})
 const hooks=Layer.succeed(ExecutorHooks,{
  ffmpegPath:Effect.try({try:options.resolveFfmpegPath,catch:failure('ffmpegPath')}),
  gpuKinds:options.resolveGpuKinds?Effect.tryPromise({try:options.resolveGpuKinds,catch:failure('gpuKinds')}):Effect.callback<readonly import("../asr-recommend").GpuKind[]>(resume=>queueMicrotask(()=>resume(Effect.succeed([])))),
  cloud:options.runCloud?((input,sink)=>Effect.tryPromise({try:()=>options.runCloud!({...input,...callbacks(sink)}),catch:failure('runCloud')}).pipe(Effect.map(output=>({...output,cleanup:output.cleanup?Effect.tryPromise({try:output.cleanup,catch:failure('cleanup')}):undefined})))):undefined,
  inProcess:options.runInProcess?((input,sink)=>Effect.tryPromise({try:()=>options.runInProcess!({...input,...callbacks(sink)}),catch:failure('runInProcess')})):undefined,
  onPartial:input=>Effect.sync(()=>options.onPartial?.(input)),onStage:input=>Effect.sync(()=>options.onStage?.(input)),removeScratch:path=>Effect.promise(()=>removeScratch(path)),
 })
 const borrowed=getStatelessRuntime(),discovery=getWorkerRuntimeRuntime()
 const services=Layer.mergeAll(host,time,hooks,aborts,TranscriptionFilesLegacySync,NodePath.layer,Layer.succeed(Scheduler.PreventSchedulerYield,true),Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>queueMicrotask(()=>resume(Effect.void)))}),
  Layer.succeed(WorkerRuntime,discovery.runSync(WorkerRuntime)),Layer.succeed(ComputeProvider,discovery.runSync(ComputeProvider)),Layer.succeed(Checkpoints,borrowed.runSync(Checkpoints)),Layer.succeed(SeedFiles,borrowed.runSync(SeedFiles)),Layer.succeed(WorkerProtocol,borrowed.runSync(WorkerProtocol)),
  Layer.succeed(ExecutorCommit,{commit:input=>Effect.sync(()=>options.store.commit(input))}),
  Layer.succeed(SeedStore,{latest:id=>Effect.try({try:()=>options.store.getLatestForDownload?.(id)??null,catch:failure('latestTranscript')}),list:id=>Effect.try({try:()=>options.store.listForDownload(id),catch:failure('listTranscripts')})}),
  Layer.succeed(Partials,{set:(...args)=>Effect.sync(()=>transcriptionPartials.set(...args)),setStage:(...args)=>Effect.sync(()=>transcriptionPartials.setStage(...args)),append:(...args)=>Effect.sync(()=>transcriptionPartials.append(...args)),getByTask:id=>Effect.sync(()=>transcriptionPartials.getByTask(id)),getByDownload:id=>Effect.sync(()=>transcriptionPartials.getByDownload(id)),clear:id=>Effect.sync(()=>transcriptionPartials.clear(id)),clearByDownload:id=>Effect.sync(()=>transcriptionPartials.clearByDownload(id)),restoreFromManifest:input=>Effect.try({try:()=>transcriptionPartials.restoreFromManifest(input),catch:failure('restorePartials')})}))
 const attempts=attemptLayer.pipe(Layer.provideMerge(services),Layer.provide(processLayer.pipe(Layer.provide(capabilities))))
 const all=executorLayer(options).pipe(Layer.provide(attempts),Layer.provide(SeedsLive.pipe(Layer.provide(services))))
 runtime=ManagedRuntime.make(all);run(TaskExecutor);return runtime
}
