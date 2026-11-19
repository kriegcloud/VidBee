import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacyPromise,runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {makeLayer} from '../../transcription/src/pipeline-fake'
import {Pipeline} from '../../transcription/src/Pipeline.service'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {legacyTimeLayer} from './host/time'
import {transcriptionCause} from './bridge/errors'
import type {PipelineRunInput,TranscriptionPipeline} from './pipeline'
import type {PipelineResult} from './types'
export interface FakePipelineOptions {result?:PipelineResult;speech?:boolean;delayMs?:number}
export class FakeTranscriptionPipeline implements TranscriptionPipeline {
 private readonly runtime
 constructor(options:FakePipelineOptions={}){
  const time=legacyTimeLayer(action=>runLegacySync(this.runtime,action,transcriptionCause))
  this.runtime=ManagedRuntime.make(makeLayer(options).pipe(Layer.provide(time),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true))))
  this.runtime.runSync(Effect.void)
 }
 run(input:PipelineRunInput):Promise<PipelineResult>{
  const callback=(operation:string,run:()=>void)=>Effect.try({try:run,catch:cause=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})
  return runLegacyPromise(this.runtime,Effect.flatMap(Pipeline,pipeline=>pipeline.run(input,{
   progress:progress=>callback('progress',()=>input.onProgress?.(progress)),
   partial:segment=>callback('partial',()=>input.onPartial?.(segment)),
   log:()=>Effect.void,
  })),transcriptionCause)
 }
}
