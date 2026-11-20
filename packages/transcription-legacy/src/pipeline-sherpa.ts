import {createRequire} from 'node:module'
import * as NodePath from '@effect/platform-node/NodePath'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {runLegacyPromise,runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import type {Addon} from 'sherpa-onnx-node'
import {makeLayer} from '../../transcription/src/SherpaPipeline.layer'
import {SherpaLive} from '../../transcription/src/Sherpa.driver'
import {SherpaLoader} from '../../transcription/src/Sherpa.service'
import {Pipeline} from '../../transcription/src/Pipeline.service'
import {Audio} from '../../transcription/src/Audio.service'
import {AtomicFilesLive} from '../../transcription/src/AtomicFiles.layer'
import {CheckpointsLive} from '../../transcription/src/Checkpoints.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {modelsLayerFor} from './model-manager'
import type {ModelManager} from './model-manager'
import type {SherpaExecutionProvider} from './compute-provider'
import type {PipelineRunInput,TranscriptionPipeline} from './pipeline'
import type {PipelineResult} from './types'
import {extractMonoWav,readPcmWav} from './audio'
import {withSanitizedJsonParse} from './asr-json'
import {TranscriptionFilesLegacySync} from './host/files'
import {TranscriptionHostLegacy} from './host/host'
import {TranscriptionIdsLegacy} from './host/ids'
import {legacyTimeLayer} from './host/time'
import {transcriptionCause} from './bridge/errors'
export {CLUSTERING_THRESHOLD} from '../../transcription/src/speaker-cluster'
export {MIN_DURATION_ON_SEC,MIN_DURATION_OFF_SEC,DIARIZE_NUM_THREADS,MAX_ASR_CHUNK_MS} from '../../transcription/src/pipeline-sherpa'
const require=createRequire(import.meta.url)
export interface SherpaPipelineOptions {
  models: ModelManager
  createAddon?: () => SherpaAddon
  provider?: SherpaExecutionProvider
}

export interface SherpaWave {
  sampleRate: number
  samples: Float32Array
}

export interface SherpaVad {
  acceptWaveform: (samples: Float32Array) => void
  isEmpty: () => boolean
  front: (enableExternalBuffer?: boolean) => { samples?: Float32Array; start?: number }
  pop: () => void
  flush: () => void
  config?: { sileroVad?: { windowSize?: number } }
}

export interface SherpaDiarization {
  sampleRate?: number
  process: (
    samples: Float32Array
  ) =>
    | Array<{ start: number; end: number; speaker: number }>
    | { get?: (i: number) => { start: number; end: number; speaker: number }; size?: number }
}

export interface SherpaStream {
  acceptWaveform: (input: { sampleRate: number; samples: Float32Array }) => void
  inputFinished?: () => void
  handle?: unknown
  setOption?: (key: string, value: string) => void
}

export interface SherpaEmbeddingExtractor {
  compute: (stream: SherpaStream, enableExternalBuffer?: boolean) => Float32Array
  createStream: () => SherpaStream
  dim?: number
  isReady?: (stream: SherpaStream) => boolean
}

export interface SherpaRecognizer {
  createStream: () => SherpaStream
  decode: (stream: SherpaStream) => void
  getResult: (stream: SherpaStream) => {
    durations?: number[]
    text?: string
    timestamps?: number[]
    tokens?: string[]
  }
}

export interface SherpaPunctuation {
  addPunct: (text: string) => string
}

export interface SherpaAddon {
  Vad: new (config: Record<string, unknown>, bufferSizeInSeconds?: number) => SherpaVad
  OfflineSpeakerDiarization: new (config: Record<string, unknown>) => SherpaDiarization
  OfflineRecognizer: new (config: Record<string, unknown>) => SherpaRecognizer
  OfflinePunctuation?: new (config: Record<string, unknown>) => SherpaPunctuation
  SpeakerEmbeddingExtractor?: new (config: Record<string, unknown>) => SherpaEmbeddingExtractor
  readWave: (path: string) => SherpaWave
}


const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
export class SherpaTranscriptionPipeline implements TranscriptionPipeline {
 private readonly runtime:ManagedRuntime.ManagedRuntime<Pipeline,never>
 constructor(options:SherpaPipelineOptions){
  const runAction=(action:Effect.Effect<void,HostFailure>)=>runLegacySync(this.runtime,action,transcriptionCause)
  const time=legacyTimeLayer(runAction)
  const loader=Layer.succeed(SherpaLoader,{
   load:Effect.try({try:():Addon=>{
    if(options.createAddon)return options.createAddon()
    try{return require('sherpa-onnx-node')}catch(error){throw new Error(`sherpa-onnx-node native addon is not available: ${error instanceof Error?error.message:String(error)}`)}
   },catch:failure('loadAddon')}),
   readResult:(recognizer,stream)=>withSanitizedJsonParse(()=>recognizer.getResult(stream)),
  })
  const native=SherpaLive.pipe(Layer.provide(Layer.mergeAll(loader,time)))
  const host=Layer.mergeAll(TranscriptionFilesLegacySync,TranscriptionHostLegacy,TranscriptionIdsLegacy,NodePath.layer)
  const checkpoints=CheckpointsLive.pipe(Layer.provide(AtomicFilesLive.pipe(Layer.provideMerge(host))))
  const audio=Layer.succeed(Audio,{
   readPcm:path=>Effect.try({try:()=>readPcmWav(path),catch:failure('readPcm')}),
   extract:input=>Effect.tryPromise({try:()=>extractMonoWav(input),catch:failure('extract')}),
  })
  const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
  const pipeline=makeLayer(options).pipe(Layer.provide(Layer.mergeAll(modelsLayerFor(options.models,runAction),native,checkpoints,audio,timing)))
  this.runtime=ManagedRuntime.make(Layer.mergeAll(pipeline,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
  this.runtime.runSync(Effect.void)
 }
 run(input:PipelineRunInput):Promise<PipelineResult>{
  return runLegacyPromise(this.runtime,Effect.flatMap(Pipeline,pipeline=>pipeline.run(input,{
   progress:progress=>Effect.try({try:()=>input.onProgress?.(progress),catch:failure('progress')}),
   partial:segment=>Effect.try({try:()=>input.onPartial?.(segment),catch:failure('partial')}),
   log:()=>Effect.void,
  })),transcriptionCause)
 }
}

import {splitTurnForAsr as coreSplitTurnForAsr} from '../../transcription/src/pipeline-sherpa'
export const splitTurnForAsr: <T extends {
    startMs: number;
    endMs: number;
}>(turn: T, maxChunkMs?: number) => T[]=coreSplitTurnForAsr
