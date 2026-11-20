import * as Effect from 'effect/Effect'
import {runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {ComputeProvider} from '../../transcription/src/WorkerRuntime.service'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {getWorkerRuntimeRuntime} from './bridge/worker-runtime'
import {transcriptionCause} from './bridge/errors'
import * as Core from '../../transcription/src/compute-provider'
import type { GpuKind } from './asr-recommend'

export const SHERPA_EXECUTION_PROVIDERS = ['cpu', 'cuda', 'directml', 'coreml'] as const

export type SherpaExecutionProvider = (typeof SHERPA_EXECUTION_PROVIDERS)[number]

export interface SherpaProviderProbeResult {
  durationMs: number | null
  error: string | null
  ok: boolean
  provider: SherpaExecutionProvider
  stderr?: string
}

export interface SherpaProviderSelection {
  cacheable: boolean
  candidates: SherpaExecutionProvider[]
  provider: SherpaExecutionProvider
  reason: string
}

export interface SelectSherpaProviderInput {
  arch?: string
  gpuKinds?: readonly GpuKind[]
  platform?: NodeJS.Platform
  probe: (provider: SherpaExecutionProvider) => Promise<SherpaProviderProbeResult>
}

/**
 * Detect sherpa-onnx logs that mean a requested provider silently used CPU instead.
 */
export const isSherpaProviderFallbackLog = (
  provider: SherpaExecutionProvider,
  text: string
): boolean => { return Core.isSherpaProviderFallbackLog(provider, text) }

/**
 * Build a compatibility-first provider ladder for this OS, architecture, and GPU set.
 */
export const sherpaProviderCandidates = (input?: {
  arch?: string
  gpuKinds?: readonly GpuKind[]
  platform?: NodeJS.Platform
}): SherpaExecutionProvider[] => {
  return Core.sherpaProviderCandidates({
    arch: input?.arch ?? process.arch,
    gpuKinds: input?.gpuKinds,
    platform: input?.platform ?? process.platform
  })
}

/** Preserve the callback Promise boundary while delegating the selection algorithm. */
export const selectSherpaProvider=(input:SelectSherpaProviderInput):Promise<SherpaProviderSelection>=>runLegacyPromise(getWorkerRuntimeRuntime(),Effect.flatMap(ComputeProvider,service=>service.select({...input,probe:provider=>Effect.tryPromise({try:()=>input.probe(provider),catch:cause=>HostFailure.make({operation:'providerProbe',legacyMessage:cause instanceof Error?cause.message:String(cause),cause})})})),transcriptionCause)
