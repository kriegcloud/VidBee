import {createRequire} from 'node:module'
import * as NodePath from '@effect/platform-node/NodePath'
import {runLegacyPromise,runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import type {Addon} from 'sherpa-onnx-node'
import {WorkerHandler,WorkerOutput,WorkerSessionFactory} from '../../../transcription/src/WorkerHandler.service'
import {WorkerHandlerLive} from '../../../transcription/src/WorkerHandler.layer'
import {SeedFilesLive} from '../../../transcription/src/SeedFiles.layer'
import {AtomicFilesLive} from '../../../transcription/src/AtomicFiles.layer'
import {CheckpointsLive} from '../../../transcription/src/Checkpoints.layer'
import {SherpaLive} from '../../../transcription/src/Sherpa.driver'
import {Sherpa,SherpaLoader} from '../../../transcription/src/Sherpa.service'
import {Audio} from '../../../transcription/src/Audio.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {recognizerConfig} from '../../../transcription/src/RecognizerConfig'
import {ModelManager,modelsLayerFor} from '../model-manager'
import {SherpaTranscriptionPipeline} from '../pipeline-sherpa'
import {FakeTranscriptionPipeline} from '../pipeline-fake'
import {extractMonoWav,readPcmWav} from '../audio'
import {withSanitizedJsonParse} from '../asr-json'
import {writeMessageSync} from '../worker/protocol'
import {TranscriptionFilesLegacySync} from '../host/files'
import {TranscriptionHostLegacy} from '../host/host'
import {TranscriptionIdsLegacy} from '../host/ids'
import {legacyTimeLayer} from '../host/time'
import {transcriptionCause} from './errors'
const require=createRequire(import.meta.url)
const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
const attempt=<A>(operation:string,action:()=>A)=>Effect.try({try:action,catch:failure(operation)})
export const makeWorkerRuntime=()=>{
 let runtime:ManagedRuntime.ManagedRuntime<WorkerHandler|WorkerOutput,never>
 const run=<A,E>(effect:Effect.Effect<A,E>):A=>runLegacySync(runtime,effect,transcriptionCause)
 const time=legacyTimeLayer(run)
 const host=Layer.mergeAll(TranscriptionFilesLegacySync,TranscriptionHostLegacy,TranscriptionIdsLegacy,NodePath.layer,time)
 const atomic=AtomicFilesLive.pipe(Layer.provideMerge(host))
 const checkpoints=CheckpointsLive.pipe(Layer.provideMerge(atomic))
 const seed=SeedFilesLive.pipe(Layer.provideMerge(checkpoints))
 const output=Layer.succeed(WorkerOutput,{
  send:message=>attempt('stdout',()=>writeMessageSync(1,message)),
  flush:Effect.callback<void,HostFailure>(resume=>{process.stdout.write('',()=>resume(Effect.void))}),
 })
 const loader=Layer.succeed(SherpaLoader,{
  load:attempt('loadAddon',()=>require('sherpa-onnx-node') as Addon),
  readResult:(recognizer,stream)=>withSanitizedJsonParse(()=>recognizer.getResult(stream)),
 })
 const sherpa=SherpaLive.pipe(Layer.provide(loader),Layer.provide(time))
 const factory=Layer.effect(WorkerSessionFactory,Effect.gen(function*(){
  const driver=yield* Sherpa;const owner=yield* Effect.scope;
  return WorkerSessionFactory.of({probeAddon:driver.session,fakeProbe:Effect.sync(()=>process.env.VIDBEE_TRANSCRIPTION_BACKEND==='fake'),
   create:Effect.fnUntraced(function*(modelsDir){
    const models=yield* attempt('newModelManager',()=>new ModelManager({modelsDir}));
    const context=yield* Layer.buildWithScope(modelsLayerFor(models,run),owner);
    return {
     beginPrepare:(tier,skip)=>attempt('prepareAsr',()=>{
      // Keep this Promise unobserved until the historical await after extraction.
      // An early rejection is still an unhandled worker rejection, as before.
      const promise:Promise<unknown>=skip?Promise.resolve():models.ensureReady({groups:['asr'],tiers:[tier]});
      return {wait:Effect.tryPromise({try:()=>promise,catch:failure('prepareAsr')}).pipe(Effect.asVoid)}
     }),
     config:(tier,provider)=>recognizerConfig(tier,provider).pipe(Effect.provide(context),Effect.orElseSucceed(()=>null)),
     run:(message,input,sink)=>Effect.tryPromise({try:()=>{
      const pipeline=message.backend==='fake'?new FakeTranscriptionPipeline():new SherpaTranscriptionPipeline({models,provider:message.provider});
      return pipeline.run({...input,onProgress:progress=>run(sink.progress(progress)),onPartial:segment=>run(sink.partial(segment))})
     },catch:failure('pipeline.run')}),
    }
   }),
  })
 })).pipe(Layer.provide(sherpa))
 const audio=Layer.succeed(Audio,{
  extract:input=>Effect.tryPromise({try:()=>extractMonoWav(input),catch:failure('extractMonoWav')}),
  readPcm:path=>attempt('readPcmWav',()=>readPcmWav(path)),
 })
 const dependencies=Layer.mergeAll(seed,factory,audio,output)
 const services=WorkerHandlerLive.pipe(Layer.provideMerge(dependencies),Layer.provide(Layer.succeed(Scheduler.PreventSchedulerYield,true)))
 runtime=ManagedRuntime.make(services)
 runtime.runSync(Effect.void)
 return {runtime,runHandler:(effect:Effect.Effect<void,HostFailure,WorkerHandler|WorkerOutput>)=>runLegacyPromise(runtime,effect,transcriptionCause)}
}
