import * as Effect from 'effect/Effect'
import {ConcurrencyQueue} from '../../transcription/src/Concurrency.service'
import {make as makeConcurrency} from '../../transcription/src/Concurrency.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {runConfiguration} from './bridge/configuration'
import * as Core from '../../transcription/src/concurrency'
// Types entry only — the package barrel evaluates Node process helpers and
// crashes the desktop renderer (`node:child_process` is browser-external).
import { canAdmitTranscription } from '@vidbee/task-queue-legacy/types'

export { canAdmitTranscription }

export const DEFAULT_MAX_CONCURRENT_TRANSCRIPTIONS = 1
export const MAX_CONCURRENT_TRANSCRIPTIONS = 4
export const CONCURRENT_TRANSCRIPTION_CHOICES = [1, 2, 3, 4] as const


export interface TranscriptionConcurrencyQueue {
  setMaxConcurrency: (n: number) => Promise<void> | void
  setMaxPerGroup: (groupKey: string, n: number | null) => Promise<void> | void
  setMaxConcurrentDownloads: (n: number) => Promise<void> | void
}

/**
 * Clamp a stored download concurrency value to the supported range.
 *
 * @param value Raw setting value from storage or UI.
 * @returns An integer between 1 and 10.
 */

/**
 * Clamp a stored transcription concurrency value to the supported range.
 *
 * @param value Raw setting value from storage or UI.
 * @returns An integer between 1 and 4.
 */
export const clampMaxConcurrentTranscriptions = (value: unknown): number => { return Core.clampMaxConcurrentTranscriptions(value) }

/**
 * Apply download and transcription caps so both limits are honored.
 *
 * Global slots stay large enough for the higher of the two caps. Transcription
 * tasks still share one group, so they cannot exceed the transcript setting.
 * A new ASR task also waits while active downloads are at the download cap and
 * starts once a download slot frees. Lowering the cap does not stop jobs that
 * are already running.
 *
 * @param input Queue plus the two stored concurrency settings.
 */
export const applyTranscriptionConcurrency = (input: {
  queue: TranscriptionConcurrencyQueue
  maxConcurrentDownloads: unknown
  maxConcurrentTranscriptions: unknown
}): void => {
  const attempt=(operation:string,action:()=>unknown)=>Effect.try({try:()=>{action()},catch:cause=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})
  runConfiguration(Effect.flatMap(makeConcurrency(),service=>service.apply(input)).pipe(Effect.provideService(ConcurrencyQueue,{setMaxConcurrency:n=>attempt('setMaxConcurrency',()=>input.queue.setMaxConcurrency(n)),setMaxPerGroup:(group,n)=>attempt('setMaxPerGroup',()=>input.queue.setMaxPerGroup(group,n)),setMaxConcurrentDownloads:n=>attempt('setMaxConcurrentDownloads',()=>input.queue.setMaxConcurrentDownloads(n))})))
}
