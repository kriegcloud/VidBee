import { loadChunkManifest, loadManifestStages, manifestPathFor } from './chunk-manifest'
import type { PipelineSegment, TranscriptionStage, TranscriptStageTiming } from './types'

export interface PartialTranscript {
  taskId: string
  downloadTaskId: string
  segments: PipelineSegment[]
  stage: TranscriptionStage | null
  stageHistory: TranscriptStageTiming[]
}

/**
 * Rank worker stages so a restarted extract cannot rewind the visible clock.
 *
 * @param stage Raw worker stage.
 * @param history Stages already recorded for this task.
 */
const stageRank = (stage: string, history: readonly TranscriptStageTiming[]): number => {
  const transcribed = history.some((item) => item.stage === 'recognizing')
  if (stage === 'queued') {
    return 0
  }
  if (stage === 'preparing-audio') {
    return 1
  }
  if (stage === 'detecting-speech') {
    return 2
  }
  if (stage === 'preparing-models') {
    return transcribed ? 4 : 1
  }
  if (stage === 'recognizing') {
    return 3
  }
  if (stage === 'diarizing') {
    return 5
  }
  if (stage === 'committing') {
    return 6
  }
  return 3
}

const buffers = new Map<string, PartialTranscript>()
const byDownload = new Map<string, string>()

const sortSegments = (segments: PipelineSegment[]): PipelineSegment[] =>
  [...segments].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

export const transcriptionPartials = {
  set(taskId: string, downloadTaskId: string, segments: PipelineSegment[]): PartialTranscript {
    const current = buffers.get(taskId)
    const next: PartialTranscript = {
      taskId,
      downloadTaskId,
      segments: sortSegments(segments),
      stage: current?.stage ?? null,
      stageHistory: current?.stageHistory ?? []
    }
    buffers.set(taskId, next)
    byDownload.set(downloadTaskId, taskId)
    return next
  },

  /**
   * Record the live pipeline stage so the transcript page can show real progress.
   *
   * @param taskId Transcription task id.
   * @param downloadTaskId Parent download id.
   * @param stage Current worker stage.
   */
  setStage(taskId: string, downloadTaskId: string, stage: TranscriptionStage): PartialTranscript {
    const current = buffers.get(taskId)
    const history = current?.stageHistory ?? []
    const last = history.at(-1)
    let stageHistory = history
    if (last?.stage !== stage) {
      const goingBack =
        last != null && stageRank(stage, history) < stageRank(last.stage, history.slice(0, -1))
      if (!goingBack) {
        stageHistory = [...history, { stage, startedAt: Date.now() }]
      }
    }
    const next: PartialTranscript = {
      taskId,
      downloadTaskId,
      segments: current?.segments ?? [],
      stage,
      stageHistory
    }
    buffers.set(taskId, next)
    byDownload.set(downloadTaskId, taskId)
    return next
  },

  append(taskId: string, downloadTaskId: string, segment: PipelineSegment): PartialTranscript {
    const current = buffers.get(taskId)?.segments ?? []
    const without = current.filter(
      (item) => !(item.startMs === segment.startMs && item.endMs === segment.endMs)
    )
    return transcriptionPartials.set(taskId, downloadTaskId, [...without, segment])
  },

  getByTask(taskId: string): PartialTranscript | null {
    return buffers.get(taskId) ?? null
  },

  getByDownload(downloadTaskId: string): PartialTranscript | null {
    const taskId = byDownload.get(downloadTaskId)
    return taskId ? (buffers.get(taskId) ?? null) : null
  },

  clear(taskId: string): void {
    const current = buffers.get(taskId)
    buffers.delete(taskId)
    if (current && byDownload.get(current.downloadTaskId) === taskId) {
      byDownload.delete(current.downloadTaskId)
    }
  },

  /**
   * Drop the live partial buffer for a parent download, if one exists.
   *
   * @param downloadTaskId Parent download id.
   */
  clearByDownload(downloadTaskId: string): void {
    const taskId = byDownload.get(downloadTaskId)
    if (taskId) {
      transcriptionPartials.clear(taskId)
    }
  },

  /**
   * Rebuild live partials from leftover `chunks.json` / `stages.json` after a crash.
   *
   * @param input Task ids and the worker work directory.
   */
  restoreFromManifest(input: {
    taskId: string
    downloadTaskId: string
    workDir: string
  }): PartialTranscript | null {
    const manifest = loadChunkManifest(manifestPathFor(input.workDir))
    const stages = loadManifestStages(input.workDir) ?? manifest?.stages ?? []
    const chunks = manifest?.chunks ?? []
    if (!(chunks.length || stages.length)) {
      return null
    }
    const restored = transcriptionPartials.set(
      input.taskId,
      input.downloadTaskId,
      chunks.map((chunk) => ({
        speakerKey: chunk.speakerKey,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        text: chunk.text,
        words: chunk.words,
        confidence: chunk.confidence
      }))
    )
    restored.stageHistory = stages
    restored.stage = (stages.at(-1)?.stage as TranscriptionStage | undefined) ?? restored.stage
    return restored
  }
}
