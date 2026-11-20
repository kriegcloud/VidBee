import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import type {Task,TaskQueueAPI,TaskCreationMetadata,TaskPriority} from '@vidbee/task-queue-legacy'
import {TERMINAL_STATUSES} from '@vidbee/task-queue-legacy'
import type {HostFailure} from '../../transcription/src/Transcription.errors'
import {TranscriptionRecords} from '../../transcription/src/TranscriptionRecords.service'
import {Enqueue} from '../../transcription/src/Enqueue.service'
import {layer} from '../../transcription/src/Enqueue.layer'
import {TranscriptionFilesLegacySync} from './host/files'
import {queueLayerFor,recordsLayerFor} from './bridge/orchestration-services'
import {transcriptionCause} from './bridge/errors'
import type {TranscriptionProvider} from './cloud'
import type {MemoryTranscriptStore} from './memory-store'
import type {TranscriptStore} from './transcript-store'
import type {SpeakerCount} from './speaker-count'
import type {TranscriptionTrigger} from './types'
export interface EnqueueTranscriptionInput {provider?:TranscriptionProvider;cloudModelId?:string;queue:TaskQueueAPI;creation?:TaskCreationMetadata;store:TranscriptStore|MemoryTranscriptStore;downloadTaskId:string;sourceFilePath:string;title?:string;trigger:TranscriptionTrigger;priority?:TaskPriority;asrTier?:string;language?:string;speakerCount?:SpeakerCount;rediarize?:boolean}
export interface EnqueueTranscriptionResult {id:string;created:boolean;reused:boolean}
const runtime=ManagedRuntime.make(Layer.succeed(Scheduler.PreventSchedulerYield,true))
runLegacySync(runtime,Effect.void,transcriptionCause)
function withEnqueue<A,E>(queue:TaskQueueAPI,store:TranscriptStore|MemoryTranscriptStore|undefined,operation:(service:typeof Enqueue.Service)=>Effect.Effect<A,E>):Effect.Effect<A,E>{
 const run=(effect:Effect.Effect<void,HostFailure>):void=>runLegacySync(runtime,effect,transcriptionCause)
 const records=store===undefined?Layer.succeed(TranscriptionRecords,{latest:()=>Effect.succeed(null),list:()=>Effect.succeed([]),commit:()=>Effect.die('no store supplied'),activate:()=>Effect.succeed(null)}):recordsLayerFor(store)
 const services=layer.pipe(Layer.provide(queueLayerFor(queue,run)),Layer.provide(records),Layer.provide(TranscriptionFilesLegacySync))
 return Effect.scoped(Effect.gen(function*(){const scope=yield* Effect.scope;const context=yield* Layer.buildWithScope(services,scope);return yield* operation(Context.get(context,Enqueue))}))
}
export function listTranscriptionChildren(queue:TaskQueueAPI,downloadTaskId:string):Task[]{return runLegacySync(runtime,withEnqueue(queue,undefined,service=>service.children(downloadTaskId)),transcriptionCause)}
export function findActiveTranscription(queue:TaskQueueAPI,downloadTaskId:string):Task|undefined{return runLegacySync(runtime,withEnqueue(queue,undefined,service=>service.active(downloadTaskId)),transcriptionCause)}
export function enqueueTranscription(input:EnqueueTranscriptionInput):Promise<EnqueueTranscriptionResult>{return runLegacyPromise(runtime,withEnqueue(input.queue,input.store,service=>service.enqueue(input)),transcriptionCause)}
export const isTerminalTranscription=(task:Task):boolean=>TERMINAL_STATUSES.has(task.status)
