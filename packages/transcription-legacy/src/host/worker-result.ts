import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {WorkerResultJson} from '../../../transcription/src/WorkerProtocol.service'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
export const WorkerResultJsonLegacy=Layer.succeed(WorkerResultJson,{parse:(text:string)=>Effect.try({try:()=>JSON.parse(text) as unknown,catch:cause=>HostFailure.make({operation:'workerResultJson',cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})})
