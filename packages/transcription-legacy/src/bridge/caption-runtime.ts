import {spawn} from 'node:child_process'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {backgroundChildSpawnOptions,lowerChildPriority} from '@vidbee/task-queue-legacy/process'
import {makeProcessCapabilitiesLayer} from '../../../downloader-core-legacy/src/Process.layer'
import {CaptionExtraction,CaptionProbeReader} from '../../../transcription/src/CaptionExtraction.service'
import type {CaptionProbeStream} from '../../../transcription/src/CaptionExtraction.model'
import {layer as extractionLayer} from '../../../transcription/src/CaptionExtraction.layer'
import {layer as ownerLayer} from '../../../transcription/src/CaptionProcessOwner.layer'
import {layer as processLayer} from '../../../transcription/src/TranscriptionProcess.layer'
import {TranscriptionHost} from '../../../transcription/src/TranscriptionHost.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {TranscriptionFilesLegacySync} from '../host/files'
import {TranscriptionHostLegacy} from '../host/host'
import {isChatCaptionTag} from '../../../transcription/src/captions'
import {transcriptionCause} from './errors'
let runtime:ManagedRuntime.ManagedRuntime<CaptionExtraction,never>
const capabilities=makeProcessCapabilitiesLayer(()=>runtime,transcriptionCause,(command,argv)=>{
 const child=spawn(command,[...argv],{stdio:['ignore','pipe','pipe'],...backgroundChildSpawnOptions()})
 lowerChildPriority(child.pid)
 return child
})
const host=Layer.effect(TranscriptionHost,Effect.map(TranscriptionHost,base=>({...base,lowerPriority:()=>Effect.void}))).pipe(Layer.provide(TranscriptionHostLegacy))
const chat=(tag:string|undefined):boolean=>{if(!tag?.trim())return false;return isChatCaptionTag(tag)}
const reader=Layer.succeed(CaptionProbeReader,{isHuman:stream=>!(chat(stream.tags?.language)||chat(stream.tags?.title)),parse:text=>Effect.try({try:()=>{
 const parsed=JSON.parse(text) as {streams?:CaptionProbeStream[]}
 return {filter:(predicate:(stream:CaptionProbeStream)=>boolean)=>Effect.try({try:()=>(parsed.streams??[]).filter(predicate),catch:cause=>HostFailure.make({operation:'caption-probe-traversal',legacyMessage:'Invalid caption probe streams',cause})})}
},catch:cause=>HostFailure.make({operation:'caption-probe-json',legacyMessage:'Invalid caption probe JSON',cause})})})
const process=processLayer.pipe(Layer.provide(capabilities))
const owner=ownerLayer.pipe(Layer.provide(process),Layer.provide(host))
const services=extractionLayer.pipe(Layer.provide(owner),Layer.provide(reader),Layer.provide(TranscriptionFilesLegacySync),Layer.provide(NodePath.layer))
runtime=ManagedRuntime.make(Layer.merge(services,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
runLegacySync(runtime,CaptionExtraction,transcriptionCause)
export const captionRuntime=runtime
