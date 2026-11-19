import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { Capture } from '../../browser-capture/src/Capture.service.js'
import { CaptureLive } from '../../browser-capture/src/Capture.layer.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
import type { CaptureJob } from '../../browser-capture/src/Capture.model.js'
import { makePlaybackLayer } from './PlaybackHost.adapter.js'
import { captureError } from './errors.js'
let captureRuntime: ManagedRuntime.ManagedRuntime<Capture, never>
captureRuntime = ManagedRuntime.make(CaptureLive.pipe(Layer.provideMerge(makePlaybackLayer(() => captureRuntime,captureError))))
captureRuntime.runSync(Effect.void)
const callback = (action: () => void) => Effect.try({try:action,catch:cause=>new HostFailure({operation:'callback',cause,legacyMessage:cause instanceof Error ? cause.message : String(cause)})})
export const runCapture = (job: CaptureJob, input: {
  signal: AbortSignal
  onLog: (message: string) => void
  onProgress: (state: {currentTime:number;duration:number;percent:number}) => void
}): Promise<{filePath:string;durationMs:number|null}> => runLegacyPromise(captureRuntime,Effect.flatMap(Capture,service=>service.run(job,input.signal,{
  log:message=>callback(()=>input.onLog(message)),progress:state=>callback(()=>input.onProgress(state)),
})),captureError)
