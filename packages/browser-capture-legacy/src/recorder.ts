import * as Effect from 'effect/Effect'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { Recorder } from '../../browser-capture/src/Recorder.service.js'
import type { RecorderStart, ScanInput } from '../../browser-capture/src/Recorder.model.js'
import { platformRuntime } from './PlatformHost.adapter.js'
import { captureError } from './errors.js'
export { buildRecorderArgs } from '../../browser-capture/src/recorder.js'
export interface RecorderHandle { stop: () => Promise<void>; }
export const measureGrabOrigin = (input: ScanInput): Promise<{x:number;y:number}> => runLegacyPromise(platformRuntime,Effect.flatMap(Recorder, service=>service.scan(input)),captureError)
export const startRecorder = (input: RecorderStart): RecorderHandle => {
  const handle = runLegacySync(platformRuntime,Effect.flatMap(Recorder,service=>service.start(input)),captureError)
  return {stop:()=>runLegacyPromise(platformRuntime,handle.stop,captureError)}
}
