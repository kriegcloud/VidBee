import type {ChildProcess} from 'node:child_process'
import * as Effect from 'effect/Effect'
import {runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {terminateWorker as terminateOwnedWorker} from '../../../transcription/src/worker/terminate'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {terminateRawWorker} from '../host/worker-termination'
import {getStatelessRuntime} from '../bridge/stateless'
import {transcriptionCause} from '../bridge/errors'
/** Reap the caller's exact raw child through the shared termination contract. */
export const terminateWorker=(child:ChildProcess,graceMs=1000):Promise<void>=>runLegacyPromise(getStatelessRuntime(),terminateOwnedWorker({terminate:milliseconds=>Effect.tryPromise({try:()=>terminateRawWorker(child,milliseconds),catch:cause=>HostFailure.make({operation:'terminateWorker',legacyMessage:cause instanceof Error?cause.message:String(cause),cause})})},graceMs),transcriptionCause)
