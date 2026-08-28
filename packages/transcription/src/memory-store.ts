import { randomUUID } from 'node:crypto'
import type { PipelineResult, TranscriptRecord } from './types'
import type { TranscriptStore } from './transcript-store'

type CommitInput = Parameters<TranscriptStore['commit']>[0]

export class MemoryTranscriptStore {
  private readonly rows = new Map<string, TranscriptRecord>()
  private readonly clock: () => number

  constructor(opts?: { clock?: () => number }) {
    this.clock = opts?.clock ?? Date.now
  }

  applySchema(): void {}

  getById(id: string): TranscriptRecord | null {
    return this.rows.get(id) ?? null
  }

  getByTranscriptionTaskId(taskId: string): TranscriptRecord | null {
    const matches = [...this.rows.values()]
      .filter((row) => row.transcriptionTaskId === taskId)
      .sort((a, b) => b.createdAt - a.createdAt)
    return matches[0] ?? null
  }

  getLatestForDownload(downloadTaskId: string): TranscriptRecord | null {
    const matches = [...this.rows.values()]
      .filter((row) => row.downloadTaskId === downloadTaskId && row.supersededAt == null)
      .sort((a, b) => b.createdAt - a.createdAt)
    return matches[0] ?? null
  }

  listForDownload(downloadTaskId: string): TranscriptRecord[] {
    return [...this.rows.values()]
      .filter((row) => row.downloadTaskId === downloadTaskId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Return every current (non-superseded) transcript, newest first.
   */
  listLatest(): TranscriptRecord[] {
    return [...this.rows.values()]
      .filter((row) => row.supersededAt == null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  commit(input: CommitInput): TranscriptRecord {
    const existing = this.getByTranscriptionTaskId(input.transcriptionTaskId)
    if (existing && existing.supersededAt == null) {
      return existing
    }
    const now = this.clock()
    for (const row of this.rows.values()) {
      if (row.downloadTaskId === input.downloadTaskId && row.supersededAt == null) {
        row.supersededAt = now
        row.updatedAt = now
      }
    }
    const record = hydrateRecord(input, now)
    this.rows.set(record.id, record)
    return record
  }

  /**
   * Drop every stored transcript for a download, including superseded rows.
   *
   * @param downloadTaskId Parent download id.
   */
  deleteByDownload(downloadTaskId: string): void {
    for (const [id, row] of this.rows) {
      if (row.downloadTaskId === downloadTaskId) {
        this.rows.delete(id)
      }
    }
  }

  /**
   * Make one stored transcript the current row for a download.
   *
   * @param downloadTaskId Parent download id.
   * @param transcriptId Row to restore.
   */
  activate(downloadTaskId: string, transcriptId: string): TranscriptRecord | null {
    const target = this.rows.get(transcriptId)
    if (!target || target.downloadTaskId !== downloadTaskId) {
      return null
    }
    const current = this.getLatestForDownload(downloadTaskId)
    if (current?.id === target.id) {
      return current
    }
    const now = this.clock()
    for (const row of this.rows.values()) {
      if (row.downloadTaskId === downloadTaskId && row.supersededAt == null && row.id !== target.id) {
        row.supersededAt = now
        row.updatedAt = now
      }
    }
    target.supersededAt = null
    target.updatedAt = now
    return target
  }
}

const hydrateRecord = (input: CommitInput, now: number): TranscriptRecord => {
  const transcriptId = input.transcriptId ?? randomUUID()
  const speakers = input.result.speakers.map((speaker, index) => ({
    id: randomUUID(),
    speakerKey: speaker.speakerKey,
    displayName: speaker.displayName,
    sortIndex: index
  }))
  const speakerIdByKey = new Map(speakers.map((speaker) => [speaker.speakerKey, speaker.id]))
  const segments = input.result.segments.map((segment, index) => ({
    id: randomUUID(),
    speakerId: segment.speakerKey ? (speakerIdByKey.get(segment.speakerKey) ?? null) : null,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    words: segment.words ?? [],
    confidence: segment.confidence,
    sortIndex: index
  }))
  return {
    id: transcriptId,
    downloadTaskId: input.downloadTaskId,
    transcriptionTaskId: input.transcriptionTaskId,
    resultKind: input.result.resultKind,
    modelVersion: input.result.modelVersion,
    asrTier: input.result.asrTier ?? null,
    language: input.result.language,
    sourceFilePath: input.sourceFilePath,
    sourceKind: input.result.sourceKind ?? 'asr',
    supersededAt: null,
    createdAt: now,
    updatedAt: now,
    speakers,
    segments
  }
}

export type { PipelineResult }
