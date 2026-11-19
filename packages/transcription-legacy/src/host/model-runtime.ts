import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { ModelFiles } from '../../../transcription/src/ModelFiles.service'
import { ModelFilesLive } from '../../../transcription/src/ModelFiles.layer'
import { transcriptionCause } from '../bridge/errors'
import { TranscriptionFilesLegacySync } from './files'
import { TranscriptionHostLegacy } from './host'
import { TranscriptionIdsLegacy } from './ids'
import { legacyTimeLayer } from './time'
import { legacyModelFileIOLayer } from './model-files'

const chunk = (effect:Effect.Effect<void,import('../../../transcription/src/Transcription.errors').HostFailure>) => runLegacySync(modelFilesRuntime,effect,transcriptionCause)
export const modelFilesDependencies = Layer.mergeAll(TranscriptionFilesLegacySync,TranscriptionHostLegacy,TranscriptionIdsLegacy,
  NodePath.layer,legacyTimeLayer(chunk),legacyModelFileIOLayer(chunk),Layer.succeed(Scheduler.PreventSchedulerYield,true))
export const modelFilesLayer = ModelFilesLive.pipe(Layer.provideMerge(modelFilesDependencies))
export const modelFilesRuntime = ManagedRuntime.make(modelFilesLayer)
export const modelFiles = runLegacySync(modelFilesRuntime,ModelFiles,transcriptionCause)
