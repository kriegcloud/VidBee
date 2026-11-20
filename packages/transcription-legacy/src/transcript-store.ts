import * as Effect from 'effect/Effect'
import * as Scheduler from 'effect/Scheduler'
import * as SqlError from 'effect/sql/SqlError'
import {runtimeForHandle,rethrowDriverError} from '@vidbee/db/legacy'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import type Database from 'better-sqlite3'
import {make} from '../../transcription/src/TranscriptStore.layer'
import {TranscriptionTime} from '../../transcription/src/TranscriptionTime.service'
import {legacyTimeLayer} from './host/time'
import {TranscriptionIdsLegacy} from './host/ids'
import {transcriptionCause} from './bridge/errors'
import type {TranscriptStore as StoreService} from '../../transcription/src/TranscriptStore.service'
import type {TranscriptRecord,PipelineResult} from './types'
import type {TranscriptHead} from './transcript-sources'
import type {TranscriptSegmentPatch,InsertTranscriptSegmentInput} from './transcript-edit'
export {TRANSCRIPT_HEAD_SQL,TRANSCRIPT_PLAYBACK_CUE_SQL} from '../../transcription/src/transcript-store'
interface SqliteStatement {
  run(...params: unknown[]): { changes: number }
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
}
interface SqliteDatabase {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
  // biome-ignore lint/suspicious/noExplicitAny: match better-sqlite3 transaction()
  transaction(fn: (...args: any[]) => unknown): ((...args: any[]) => unknown) & {
    immediate: (...args: any[]) => unknown
  }
}
export interface TranscriptStoreOptions {
  db: SqliteDatabase
  clock?: () => number
}
export interface TranscriptPlaybackCue {
  confidence: number | null
  endMs: number
  id: string
  sortIndex: number
  speakerId: string | null
  startMs: number
  text: string
}
export class TranscriptStore {
 private readonly runtime: ReturnType<typeof runtimeForHandle>
 private readonly store: typeof StoreService.Service
 constructor(opts:TranscriptStoreOptions){
  this.runtime=runtimeForHandle(opts.db as Database.Database)
  const clock=opts.clock??Date.now
  this.store=this.run(Effect.flatMap(TranscriptionTime,time=>make().pipe(Effect.provideService(TranscriptionTime,{...time,now:Effect.sync(clock)}))).pipe(Effect.provide(legacyTimeLayer(action=>{this.run(action)})),Effect.provide(TranscriptionIdsLegacy)))
  this.applySchema()
 }
 private run<A,E>(effect:Effect.Effect<A,E,import('effect/sql/SqlClient').SqlClient>):A{
  return runLegacySync(this.runtime,effect.pipe(Effect.provideService(Scheduler.PreventSchedulerYield,true)),cause=>{const mapped=transcriptionCause(cause);if(SqlError.isSqlError(mapped))return rethrowDriverError(cause);return mapped})
 }
applySchema(): void { return this.run(this.store.applySchema) as void }
getById(id: string): TranscriptRecord | null { return this.run(this.store.getById(id)) as TranscriptRecord | null }
getByTranscriptionTaskId(taskId: string): TranscriptRecord | null { return this.run(this.store.getByTranscriptionTaskId(taskId)) as TranscriptRecord | null }
getLatestForDownload(downloadTaskId: string): TranscriptRecord | null { return this.run(this.store.getLatestForDownload(downloadTaskId)) as TranscriptRecord | null }
listForDownload(downloadTaskId: string): TranscriptRecord[] { return this.run(this.store.listForDownload(downloadTaskId)) as TranscriptRecord[] }
listLatest(): TranscriptRecord[] { return this.run(this.store.listLatest) as TranscriptRecord[] }
listHeads(): TranscriptHead[] { return this.run(this.store.listHeads) as TranscriptHead[] }
listHeadsForDownload(downloadTaskId: string): TranscriptHead[] { return this.run(this.store.listHeadsForDownload(downloadTaskId)) as TranscriptHead[] }
hasCurrent(downloadTaskId: string): boolean { return this.run(this.store.hasCurrent(downloadTaskId)) as boolean }
listPlaybackCues(transcriptId: string): TranscriptPlaybackCue[] { return this.run(this.store.listPlaybackCues(transcriptId)) as TranscriptPlaybackCue[] }
commit(input: {
    downloadTaskId: string
    transcriptionTaskId: string
    sourceFilePath: string | null
    result: PipelineResult
    transcriptId?: string
    activate?: boolean
  }): TranscriptRecord { return this.run(this.store.commit(input)) as TranscriptRecord }
appendCaptionCues(
    transcriptId: string,
    cues: ReadonlyArray<{ startMs: number; endMs: number; text: string }>
  ): TranscriptRecord { return this.run(this.store.appendCaptionCues(transcriptId, cues)) as TranscriptRecord }
deleteByDownload(downloadTaskId: string): void { return this.run(this.store.deleteByDownload(downloadTaskId)) as void }
activate(downloadTaskId: string, transcriptId: string): TranscriptRecord | null { return this.run(this.store.activate(downloadTaskId, transcriptId)) as TranscriptRecord | null }
updateSegment(
    transcriptId: string,
    segmentId: string,
    patch: TranscriptSegmentPatch
  ): TranscriptRecord | null { return this.run(this.store.updateSegment(transcriptId, segmentId, patch)) as TranscriptRecord | null }
deleteSegments(transcriptId: string, segmentIds: string[]): TranscriptRecord | null { return this.run(this.store.deleteSegments(transcriptId, segmentIds)) as TranscriptRecord | null }
insertSegment(
    transcriptId: string,
    input: InsertTranscriptSegmentInput
  ): { record: TranscriptRecord; segmentId: string } | null { return this.run(this.store.insertSegment(transcriptId, input)) as { record: TranscriptRecord; segmentId: string } | null }
}
