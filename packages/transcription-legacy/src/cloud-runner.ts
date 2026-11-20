import * as Core from '@vidbee/transcription/cloud-runner'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {CloudTranscription} from '../../transcription/src/CloudTranscription.service'
import {layer} from '../../transcription/src/CloudTranscription.layer'
import {Audio} from '../../transcription/src/Audio.service'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {CloudFileIOLegacy} from './host/cloud-files'
import {TranscriptionFilesLegacyAsync} from './host/files'
import {TranscriptionIdsLegacy} from './host/ids'
import {BinaryWaveReaderLegacy} from './host/wave-reader'
import {transcriptionCause} from './bridge/errors'
import {extractMonoWav} from './audio'
import type {CloudTranscriptionResult} from './cloud'
import type {PipelineResult,PipelineSegment,TranscriptionStage} from './types'
export interface CloudTranscriptionRunInput {accountId:string;taskId:string;sourceFilePath:string;modelId:string;ffmpegPath:string;workRoot:string;signal:AbortSignal;transcribe:(audio:Uint8Array,requestId:string,signal:AbortSignal)=>Promise<CloudTranscriptionResult>;onProgress:(stage:TranscriptionStage,percent:number|null)=>void;onPartial:(segment:PipelineSegment)=>void}
const failure=(cause:unknown)=>HostFailure.make({operation:'cloud-host',legacyMessage:cause instanceof Error?cause.message:String(cause),cause})
const audio=Layer.succeed(Audio,{extract:input=>Effect.tryPromise({try:()=>extractMonoWav(input),catch:failure}),readPcm:()=>Effect.die('Cloud does not use the general PCM reader')})
const services=layer.pipe(Layer.provide(CloudFileIOLegacy),Layer.provide(TranscriptionFilesLegacyAsync),Layer.provide(TranscriptionIdsLegacy),Layer.provide(BinaryWaveReaderLegacy),Layer.provide(audio),Layer.provide(NodePath.layer))
const runtime=ManagedRuntime.make(Layer.merge(services,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
runLegacySync(runtime,CloudTranscription,transcriptionCause)
export function cloudClipWav(pcm:Uint8Array):Uint8Array<ArrayBuffer>{return Core.cloudClipWav(pcm)}
export function runCloudTranscription(input:CloudTranscriptionRunInput):Promise<{result:PipelineResult;durationMs:number;cleanup:()=>Promise<void>}>{
 return runLegacyPromise(runtime,Effect.flatMap(CloudTranscription,service=>service.run(input,{
  checkAbort:Effect.try({try:()=>input.signal.throwIfAborted(),catch:failure}),
  transcribe:(bytes,id,signal)=>Effect.tryPromise({try:()=>input.transcribe(bytes,id,signal),catch:failure}),
  progress:(stage,percent)=>Effect.try({try:()=>input.onProgress(stage,percent),catch:failure}),
  partial:segment=>Effect.try({try:()=>input.onPartial(segment),catch:failure}),
  failureInfo:error=>Effect.try({try:()=>{const details=error as {code?:string;status?:number};return {failedReservation:details.code==='AI_TRANSCRIPTION_FAILED',conflict:details.status===409}},catch:failure}),
 })).pipe(Effect.map(result=>({...result,cleanup:()=>runLegacyPromise(runtime,result.cleanup,transcriptionCause)}))),transcriptionCause)
}
