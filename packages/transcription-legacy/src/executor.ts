import * as Effect from 'effect/Effect'
import {TaskExecutor} from '@vidbee/task-queue/TaskExecutor.service'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import type {Executor,ExecutorContext,ExecutorEvents,ExecutorRun} from '@vidbee/task-queue-legacy'
import type {GpuKind} from './asr-recommend'
import type {WorkerRuntimeLayer} from './runtime'
import type {MemoryTranscriptStore} from './memory-store'
import type {TranscriptStore} from './transcript-store'
import type {PipelineSeed} from './speaker-assign'
import type {PipelineResult,PipelineSegment,TranscriptionStage} from './types'
import {makeExecutorRuntime,executorCause,removeScratch} from './bridge/executor-runtime'
export const removeTranscriptionWorkDir=(workDir:string):Promise<void>=>removeScratch(workDir)
export type TranscriptionBackend = 'sherpa' | 'fake'

export interface TranscriptionExecutorOptions {
  store: TranscriptStore | MemoryTranscriptStore
  workerScript: string
  modelsDir: string
  resolveFfmpegPath: () => string
  backend?: TranscriptionBackend
  execPath?: string
  execArgv?: string[]
  env?: NodeJS.ProcessEnv
  workDir?: string
  bundledNodePath?: string | null
  forceLayer?: WorkerRuntimeLayer
  maxWorkerRestarts?: number
  skipProbe?: boolean
  resolveGpuKinds?: () => Promise<readonly GpuKind[]>
  runCloud?: (input: {
    taskId: string
    sourceFilePath: string
    modelId: string
    signal: AbortSignal
    onProgress: (stage: TranscriptionStage, percent: number | null) => void
    onPartial: (segment: PipelineSegment) => void
  }) => Promise<{ result: PipelineResult; durationMs: number; cleanup?: () => Promise<void> }>
  /**
   * Test seam: run the pipeline in-process instead of forking a worker.
   */
  runInProcess?: (input: {
    sourceFilePath: string
    skipVad: boolean
    autoSkipAllowed: boolean
    asrTier: string
    language?: string
    speakerCount?: import('./speaker-count').SpeakerCount
    existingTranscript?: PipelineSeed
    signal: AbortSignal
    onProgress: (stage: TranscriptionStage, percent: number | null) => void
    onPartial?: (segment: PipelineSegment) => void
  }) => Promise<{ result: PipelineResult; durationMs: number }>
  onPartial?: (input: {
    taskId: string
    downloadTaskId: string
    segments: PipelineSegment[]
  }) => void
  onStage?: (input: { taskId: string; downloadTaskId: string; stage: TranscriptionStage }) => void
}

export class TranscriptionExecutor implements Executor {
 private readonly runtime:ReturnType<typeof makeExecutorRuntime>
 constructor(options:TranscriptionExecutorOptions){this.runtime=makeExecutorRuntime(options)}
 run(ctx:ExecutorContext,events:ExecutorEvents):ExecutorRun {
  const handle=runLegacySync(this.runtime,Effect.flatMap(TaskExecutor,service=>service.run(ctx,{emit:event=>Effect.sync(()=>{
   const {type,...payload}=event
   if(type==='spawn')events.onSpawn(payload as Parameters<ExecutorEvents['onSpawn']>[0])
   else if(type==='progress')events.onProgress(payload as Parameters<ExecutorEvents['onProgress']>[0])
   else if(type==='processing')events.onProcessing?.(payload)
   else if(type==='std')events.onStd(payload as Parameters<ExecutorEvents['onStd']>[0])
   else events.onFinish(payload as Parameters<ExecutorEvents['onFinish']>[0])
  })})),executorCause)
  return {cancel:()=>runLegacyPromise(this.runtime,handle.cancel(),executorCause),pause:()=>runLegacyPromise(this.runtime,handle.pause,executorCause)}
 }
}
