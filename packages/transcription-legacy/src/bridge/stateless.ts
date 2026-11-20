import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import type * as Path from 'effect/Path'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {AtomicFilesLive} from '../../../transcription/src/AtomicFiles.layer'
import {WorkerResultJsonLegacy} from '../host/worker-result'
import {WorkerProtocolLive} from '../../../transcription/src/WorkerProtocol.layer'
import type {WorkerProtocol} from '../../../transcription/src/WorkerProtocol.service'
import {SeedFilesLive} from '../../../transcription/src/SeedFiles.layer'
import type {SeedFiles} from '../../../transcription/src/SeedFiles.service'
import {PartialsManifestLive} from '../../../transcription/src/PartialsManifest.layer'
import type {PartialsManifest} from '../../../transcription/src/Partials.service'
import {CaptionFilesLive} from '../../../transcription/src/CaptionFiles.layer'
import type {CaptionFiles} from '../../../transcription/src/CaptionFiles.service'
import {CheckpointsLive} from '../../../transcription/src/Checkpoints.layer'
import type {AtomicFiles} from '../../../transcription/src/AtomicFiles.service'
import type {Checkpoints} from '../../../transcription/src/Checkpoints.service'
import type {TranscriptionFiles} from '../../../transcription/src/TranscriptionFiles.service'
import type {TranscriptionHost} from '../../../transcription/src/TranscriptionHost.service'
import type {TranscriptionIds} from '../../../transcription/src/TranscriptionIds.service'
import type {TranscriptionTime} from '../../../transcription/src/TranscriptionTime.service'
import {TranscriptionFilesLegacySync} from '../host/files'
import {TranscriptionHostLegacy} from '../host/host'
import {TranscriptionIdsLegacy} from '../host/ids'
import {legacyTimeLayer} from '../host/time'
import {transcriptionCause} from './errors'
type StatelessServices=CaptionFiles|PartialsManifest|WorkerProtocol|SeedFiles|AtomicFiles|Checkpoints|TranscriptionFiles|TranscriptionHost|TranscriptionIds|TranscriptionTime|Path.Path
let owner:ManagedRuntime.ManagedRuntime<StatelessServices,never>|undefined
export const getStatelessRuntime=():ManagedRuntime.ManagedRuntime<StatelessServices,never>=>{
 if(owner===undefined){
  const host=Layer.mergeAll(TranscriptionFilesLegacySync,TranscriptionHostLegacy,TranscriptionIdsLegacy,NodePath.layer,Layer.succeed(Scheduler.PreventSchedulerYield,true),legacyTimeLayer(action=>runLegacySync(getStatelessRuntime(),action,transcriptionCause)))
  const atomic=AtomicFilesLive.pipe(Layer.provideMerge(host))

  const services=Layer.mergeAll(CaptionFilesLive,CheckpointsLive,SeedFilesLive,WorkerProtocolLive.pipe(Layer.provide(WorkerResultJsonLegacy))).pipe(Layer.provideMerge(atomic))
  owner=ManagedRuntime.make(PartialsManifestLive.pipe(Layer.provideMerge(services)))
  owner.runSync(Effect.void)
 }
 return owner
}
export const runStateless=<A,E>(effect:Effect.Effect<A,E,StatelessServices>):A=>runLegacySync(getStatelessRuntime(),effect,transcriptionCause)
