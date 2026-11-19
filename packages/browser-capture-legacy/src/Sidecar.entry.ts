import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { Capture } from '../../browser-capture/src/Capture.service.js'
import { CaptureLive } from '../../browser-capture/src/Capture.layer.js'
import { CaptureFiles } from '../../browser-capture/src/CaptureFiles.service.js'
import { CaptureHost } from '../../browser-capture/src/CaptureHost.service.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
import { SidecarJson } from '../../browser-capture/src/Sidecar.service.js'
import { runSidecar } from '../../browser-capture/src/SidecarProgram.js'
import { makePlaybackLayer } from './PlaybackHost.adapter.js'
import { encodeSidecarEvent } from './protocol.js'
import { captureError } from './errors.js'
import type { SidecarEvent } from '../../browser-capture/src/Protocol.model.js'
const abort = new AbortController()
const stop = () => abort.abort()
process.on('SIGTERM',stop)
process.on('SIGINT',stop)
let runtime:ManagedRuntime.ManagedRuntime<Capture|CaptureFiles|CaptureHost|LegacyTiming|SidecarJson,never>
const capture = CaptureLive.pipe(Layer.provideMerge(makePlaybackLayer(()=>runtime,captureError)))
const json = Layer.succeed(SidecarJson,{parse:(text:string)=>Effect.try({try:()=>JSON.parse(text) as unknown,catch:cause=>new HostFailure({operation:'sidecar.json',cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})})
runtime=ManagedRuntime.make(Layer.merge(capture,json))
runtime.runSync(Effect.void)
const emit = (event:SidecarEvent) => {process.stdout.write(`${encodeSidecarEvent(event)}\n`)}
runLegacyPromise(runtime,runSidecar(process.argv,abort.signal,{emit:event=>Effect.sync(()=>emit(event))}),captureError).catch((error:unknown)=>{
  emit({message:error instanceof Error?error.message:String(error),type:'error'})
  process.exitCode=1
})
