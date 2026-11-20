import * as Effect from 'effect/Effect'
import {Checkpoints} from '../../transcription/src/Checkpoints.service'
import {runStateless} from './bridge/stateless'
import * as Core from '@vidbee/transcription/chunk-manifest'
import { atomicWriteJson } from './atomic-file'
import type {
  PipelineSegment,
  PipelineSpeaker,
  TranscriptStageTiming,
  TranscriptWord
} from './types'

export interface ManifestTurn {
  startMs: number
  endMs: number
  speakerKey: string
}

export interface ManifestChunk {
  index: number
  startMs: number
  endMs: number
  speakerKey: string | null
  text: string
  words?: TranscriptWord[]
  confidence: number | null
}

export interface ChunkManifest {
  key: {
    taskId: string
    fingerprint: string
    modelVersion: string
  }
  durationMs: number | null
  speakers: PipelineSpeaker[]
  turns: ManifestTurn[]
  chunks: ManifestChunk[]
  stages: TranscriptStageTiming[]
}

export const sourceFingerprint = (filePath: string): string => {return runStateless(Effect.flatMap(Checkpoints,service=>service.sourceFingerprint(filePath)))}

export const manifestWorkKey = (
  taskId: string,
  fingerprint: string,
  modelVersion: string
): string =>
  Core.manifestWorkKey(taskId, fingerprint, modelVersion)

export const manifestPathFor = (workDir: string): string => (()=>{return runStateless(Effect.map(Checkpoints,service=>service.manifestPath(workDir)))})()

/**
 * Host-only stage clock, kept off `chunks.json` so the worker can append ASR
 * chunks without sharing a `.tmp` rename.
 *
 * @param workDir Pipeline work directory.
 */
export const stagesPathFor = (workDir: string): string => (()=>{return runStateless(Effect.map(Checkpoints,service=>service.stagesPath(workDir)))})()


export const loadChunkManifest=(filePath:string):ChunkManifest|null=>runStateless(Checkpoints.use(service=>service.load(filePath))) as ChunkManifest|null

/**
 * Atomically persist the ASR chunk manifest.
 *
 * @param filePath Destination `chunks.json` path.
 * @param manifest Manifest to write.
 */
export const saveChunkManifest = (filePath: string, manifest: ChunkManifest): void => {return atomicWriteJson(filePath,manifest)}

/**
 * Merge fields into the on-disk manifest. In-memory snapshots must not rewrite
 * `chunks` — that used to wipe ASR after diarization saved turns.
 *
 * @param filePath Destination `chunks.json` path.
 * @param patch Speakers, turns, or duration to publish.
 */
export const patchChunkManifest = (
  filePath: string,
  patch: Partial<Pick<ChunkManifest, 'speakers' | 'turns' | 'durationMs'>>
): ChunkManifest => {return runStateless(Effect.flatMap(Checkpoints,service=>service.patch(filePath,patch))) as ChunkManifest}

export const ensureChunkManifest = (input: {
  workDir: string
  taskId: string
  fingerprint: string
  modelVersion: string
}): { path: string; manifest: ChunkManifest } => {return runStateless(Effect.flatMap(Checkpoints,service=>service.ensure(input))) as {path:string;manifest:ChunkManifest}}

/**
 * Load thinking-step timings written by the host process.
 *
 * @param workDir Pipeline work directory.
 */
export const loadManifestStages = (workDir: string): TranscriptStageTiming[] | null => {return runStateless(Effect.flatMap(Checkpoints,service=>service.loadStages(workDir)))}

/**
 * Persist thinking-step timings next to ASR chunks so a restart can resume the clock.
 * Written to `stages.json` so the host never races the worker's `chunks.json`.
 *
 * @param workDir Pipeline work directory.
 * @param stages Stage history with start timestamps.
 */
export const saveManifestStages = (workDir: string, stages: TranscriptStageTiming[]): void => {return runStateless(Effect.flatMap(Checkpoints,service=>service.saveStages(workDir,stages)))}

export const chunkKey = (startMs: number, endMs: number): string => Core.chunkKey(startMs, endMs)

export const completedChunkKeys = (manifest: ChunkManifest): Set<string> =>
  new Set(manifest.chunks.map(chunk=>Core.chunkKey(chunk.startMs,chunk.endMs)))

export const appendManifestChunk = (
  filePath: string,
  chunk: ManifestChunk,
  extras?: Partial<Pick<ChunkManifest, 'speakers' | 'turns' | 'durationMs'>>
): ChunkManifest => {return runStateless(Effect.flatMap(Checkpoints,service=>service.append(filePath,chunk,extras))) as ChunkManifest}

export const resultFromManifest = (
  manifest: ChunkManifest
): { speakers: PipelineSpeaker[]; segments: PipelineSegment[] } => (Core.resultFromManifest(manifest))
