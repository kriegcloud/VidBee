import * as Effect from 'effect/Effect'
import {TranscriptionHost} from '../../transcription/src/TranscriptionHost.service'
import {runStateless} from './bridge/stateless'
export {resolveWorkerExecPath} from './runtime'
export const sherpaNativePackageName=(platform=process.platform,arch=process.arch):string=>`sherpa-onnx-${platform==='win32'?'win':platform}-${arch}`
export function resolveSherpaLibraryDir():string|null{return runStateless(Effect.flatMap(TranscriptionHost,host=>host.libraryDirectory))}
export function sherpaWorkerEnv(extra?:NodeJS.ProcessEnv,opts?:{electronAsNode?:boolean}):NodeJS.ProcessEnv{return runStateless(Effect.flatMap(TranscriptionHost,host=>host.workerEnvironment(extra,opts?.electronAsNode)))}
