import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {make} from '../../transcription/src/Partials.layer'
import {PartialsManifest} from '../../transcription/src/Partials.service'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {legacyTimeLayer} from './host/time'
import {transcriptionCause} from './bridge/errors'
import {runStateless} from './bridge/stateless'
import type {PipelineSegment,TranscriptionStage,TranscriptStageTiming} from './types'
export interface PartialTranscript {
  taskId: string
  downloadTaskId: string
  segments: PipelineSegment[]
  stage: TranscriptionStage | null
  stageHistory: TranscriptStageTiming[]
}
const runtime=ManagedRuntime.make(Layer.succeed(Scheduler.PreventSchedulerYield,true))
const run=<A,E>(effect:Effect.Effect<A,E>):A=>runLegacySync(runtime,effect,transcriptionCause)
const partials=run(make().pipe(Effect.provide(legacyTimeLayer(action=>{run(action)})),Effect.provideService(PartialsManifest,{load:(workDir)=>Effect.try({try:()=>{
 return runStateless(PartialsManifest.use(service=>service.load(workDir)))
},catch:cause=>HostFailure.make({operation:'restoreFromManifest',legacyMessage:cause instanceof Error?cause.message:String(cause),cause})})})))
export const transcriptionPartials={
set(taskId: string, downloadTaskId: string, segments: PipelineSegment[]): PartialTranscript { return run(partials.set(taskId, downloadTaskId, segments)) as PartialTranscript },
setStage(taskId: string, downloadTaskId: string, stage: TranscriptionStage): PartialTranscript { return run(partials.setStage(taskId, downloadTaskId, stage)) as PartialTranscript },
append(taskId: string, downloadTaskId: string, segment: PipelineSegment): PartialTranscript { return run(partials.append(taskId, downloadTaskId, segment)) as PartialTranscript },
getByTask(taskId: string): PartialTranscript | null { return run(partials.getByTask(taskId)) as PartialTranscript | null },
getByDownload(downloadTaskId: string): PartialTranscript | null { return run(partials.getByDownload(downloadTaskId)) as PartialTranscript | null },
clear(taskId: string): void { return run(partials.clear(taskId)) as void },
clearByDownload(downloadTaskId: string): void { return run(partials.clearByDownload(downloadTaskId)) as void },
restoreFromManifest(input: {
    taskId: string
    downloadTaskId: string
    workDir: string
  }): PartialTranscript | null { return run(partials.restoreFromManifest(input)) as PartialTranscript | null },
}
