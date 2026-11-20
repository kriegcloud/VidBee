import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type {TaskQueueAPI} from '@vidbee/task-queue-legacy'
import {TranscriptionQueue} from '../../../transcription/src/TranscriptionQueue.service'
import {TranscriptionRecords} from '../../../transcription/src/TranscriptionRecords.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import type {MemoryTranscriptStore} from '../memory-store'
import type {TranscriptStore} from '../transcript-store'
const failure=(cause:unknown)=>HostFailure.make({operation:'orchestration-host',legacyMessage:'Transcription host operation failed',cause})
export const queueLayerFor=(queue:TaskQueueAPI,run:(action:Effect.Effect<void,HostFailure>)=>void)=>Layer.succeed(TranscriptionQueue,{
 get:id=>Effect.try({try:()=>queue.get(id),catch:failure}),
 list:options=>Effect.try({try:()=>queue.list(options),catch:failure}),
 add:request=>Effect.tryPromise({try:()=>queue.add(request),catch:failure}),
 cancel:(id,reason)=>Effect.tryPromise({try:()=>queue.cancel(id,reason),catch:failure}),
 retryManual:id=>Effect.tryPromise({try:()=>queue.retryManual(id),catch:failure}),
 subscribe:sink=>Effect.try({try:()=>{const remove=queue.subscribe(event=>run(sink.emit(event)));return {unsubscribe:Effect.sync(remove)}},catch:failure}),
})
export const recordsLayerFor=(store:TranscriptStore|MemoryTranscriptStore)=>Layer.succeed(TranscriptionRecords,{
 latest:id=>Effect.try({try:()=>store.getLatestForDownload(id),catch:failure}),
 list:id=>Effect.try({try:()=>store.listForDownload(id),catch:failure}),
 commit:input=>Effect.try({try:()=>store.commit(input),catch:failure}),
 activate:(downloadId,transcriptId)=>Effect.try({try:()=>store.activate(downloadId,transcriptId),catch:failure}),
})
