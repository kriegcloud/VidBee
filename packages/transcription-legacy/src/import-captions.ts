import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {CaptionImport} from '../../transcription/src/CaptionImport.service'
import {layer} from '../../transcription/src/CaptionImport.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {CaptionFilesLegacy} from './host/caption-files'
import {recordsLayerFor} from './bridge/orchestration-services'
import {transcriptionCause} from './bridge/errors'
import type {CaptionTrack} from './captions'
import type {ExtractedCaptionTrack} from './extract-captions'
import type {MemoryTranscriptStore} from './memory-store'
import type {TranscriptStore} from './transcript-store'
import type {TranscriptRecord} from './types'
export interface ImportCaptionsInput {downloadTaskId:string;extractEmbedded?:()=>Promise<ExtractedCaptionTrack[]>;preferredLanguages?:string[];sourceFilePath:string;store:TranscriptStore|MemoryTranscriptStore}
type Runtime=ManagedRuntime.ManagedRuntime<CaptionImport,never>
const owners=new WeakMap<TranscriptStore|MemoryTranscriptStore,Runtime>()
function owner(store:TranscriptStore|MemoryTranscriptStore):Runtime{
 const found=owners.get(store);if(found)return found
 const services=layer.pipe(Layer.provide(recordsLayerFor(store)),Layer.provide(CaptionFilesLegacy))
 const runtime=ManagedRuntime.make(Layer.merge(services,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
 runLegacySync(runtime,CaptionImport,transcriptionCause);owners.set(store,runtime);return runtime
}
export const commitCaptionTrack=(input:Omit<ImportCaptionsInput,'extractEmbedded'>&{convertScript?:boolean;replace?:boolean;track:CaptionTrack}):TranscriptRecord|null=>runLegacySync(owner(input.store),Effect.flatMap(CaptionImport,service=>service.commit(input)),transcriptionCause) as TranscriptRecord|null
export const switchToCaptionLanguage=(input:Omit<ImportCaptionsInput,'extractEmbedded'>&{language:string}):TranscriptRecord|null=>runLegacySync(owner(input.store),Effect.flatMap(CaptionImport,service=>service.switchLanguage(input)),transcriptionCause) as TranscriptRecord|null
export const importSidecarCaptionsIfPresent=(input:Omit<ImportCaptionsInput,'extractEmbedded'>):TranscriptRecord|null=>runLegacySync(owner(input.store),Effect.flatMap(CaptionImport,service=>service.sidecar(input)),transcriptionCause) as TranscriptRecord|null
export const importCaptionsForDownload=(input:ImportCaptionsInput):Promise<TranscriptRecord|null>=>runLegacyPromise(owner(input.store),Effect.flatMap(CaptionImport,service=>service.download(input,()=>{
 if(!input.extractEmbedded)return undefined
 return Effect.tryPromise({try:()=>{const callback=input.extractEmbedded;return callback===undefined?Promise.resolve([]):callback.call(input)},catch:cause=>HostFailure.make({operation:'caption-embedded-hook',legacyMessage:'Caption extraction failed',cause})})
})),transcriptionCause) as Promise<TranscriptRecord|null>
