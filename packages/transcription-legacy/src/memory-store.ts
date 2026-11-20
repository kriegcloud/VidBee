import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {makeMemory} from '../../transcription/src/memory-store'
import {TranscriptionTime} from '../../transcription/src/TranscriptionTime.service'
import {legacyTimeLayer} from './host/time'
import {TranscriptionIdsLegacy} from './host/ids'
import {transcriptionCause} from './bridge/errors'
import type {TranscriptStore as StoreService} from '../../transcription/src/TranscriptStore.service'
import type {TranscriptRecord,PipelineResult} from './types'
import type {TranscriptStore} from './transcript-store'
import type {TranscriptSegmentPatch,InsertTranscriptSegmentInput} from './transcript-edit'
type CommitInput=Parameters<TranscriptStore['commit']>[0]
export class MemoryTranscriptStore {
 private readonly runtime=ManagedRuntime.make(Layer.succeed(Scheduler.PreventSchedulerYield,true))
 private readonly store: typeof StoreService.Service
 constructor(opts?:{clock?:()=>number}){
  const clock=opts?.clock??Date.now
  this.store=this.run(Effect.flatMap(TranscriptionTime,time=>makeMemory().pipe(Effect.provideService(TranscriptionTime,{...time,now:Effect.sync(clock)}))).pipe(Effect.provide(legacyTimeLayer(action=>{this.run(action)})),Effect.provide(TranscriptionIdsLegacy)))
 }
 private run<A,E>(effect:Effect.Effect<A,E>):A{return runLegacySync(this.runtime,effect,transcriptionCause)}
applySchema(): void { return this.run(this.store.applySchema) as void }
getById(id: string): TranscriptRecord | null { return this.run(this.store.getById(id)) as TranscriptRecord | null }
getByTranscriptionTaskId(taskId: string): TranscriptRecord | null { return this.run(this.store.getByTranscriptionTaskId(taskId)) as TranscriptRecord | null }
getLatestForDownload(downloadTaskId: string): TranscriptRecord | null { return this.run(this.store.getLatestForDownload(downloadTaskId)) as TranscriptRecord | null }
listForDownload(downloadTaskId: string): TranscriptRecord[] { return this.run(this.store.listForDownload(downloadTaskId)) as TranscriptRecord[] }
listLatest(): TranscriptRecord[] { return this.run(this.store.listLatest) as TranscriptRecord[] }
commit(input: CommitInput): TranscriptRecord { return this.run(this.store.commit(input)) as TranscriptRecord }
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
export type {PipelineResult}
