import { killProcessTree } from '@vidbee/task-queue-legacy/process'
import { CaptureHost } from '../../browser-capture/src/CaptureHost.service.js'
import { resolveBrowserExecutable, isBrowserCaptureAvailable, userHomeDir } from './availability.js'
import type { Executor, ExecutorContext, ExecutorEvents, ExecutorRun } from '@vidbee/task-queue-legacy'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import { runLegacySync, runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { CaptureExecutorOptions } from '../../browser-capture/src/CaptureExecutor.service.js'
import { BrowserCaptureExecutorLive } from '../../browser-capture/src/executor.js'
import { BrowserCallbacks } from '../../browser-capture/src/Playwright.service.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
import { makeCapturePlatformLayer } from './CapturePlatform.layer.js'
import { executorSink } from './executor-bridge.js'
import { captureError } from './errors.js'
export interface BrowserCaptureExecutorOptions {
  resolveSidecarScript:()=>string
  resolveFfmpegPath:()=>string
  defaultDownloadDir:string
  execPath?:string
  execArgv?:string[]
  killGraceMs?:number
  env?:NodeJS.ProcessEnv
}
const invoke=(operation:string,action:()=>string)=>Effect.try({try:action,catch:cause=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})
export class BrowserCaptureExecutor implements Executor {
  private readonly runtime:ManagedRuntime.ManagedRuntime<TaskExecutor,never>
  constructor(options:BrowserCaptureExecutorOptions) {
    const basePlatform=makeCapturePlatformLayer(()=>this.runtime,captureError)
    const host=Layer.effect(CaptureHost,Effect.map(CaptureHost,host=>({...host,browser:(preference?:string)=>Effect.sync(()=>resolveBrowserExecutable(preference)),available:Effect.sync(()=>isBrowserCaptureAvailable()),snapshot:Effect.map(host.snapshot,snapshot=>({...snapshot,home:userHomeDir()}))}))).pipe(Layer.provide(basePlatform))
    const platform=Layer.merge(basePlatform,host)
    const callbacks=Layer.succeed(BrowserCallbacks,{
      sync:effect=>{runLegacySync(this.runtime,effect,captureError)},
      promise:effect=>runLegacyPromise(this.runtime,effect,captureError),
    })
    const opts=Layer.succeed(CaptureExecutorOptions,{
      ...options,
      cancelBeforeSpawn:Effect.sync(()=>killProcessTree(undefined,'SIGTERM')),
      resolveSidecarScript:invoke('sidecar path',options.resolveSidecarScript),
      resolveFfmpegPath:invoke('ffmpeg path',options.resolveFfmpegPath),
    })
    this.runtime=ManagedRuntime.make(BrowserCaptureExecutorLive.pipe(Layer.provide(Layer.mergeAll(platform,callbacks,opts)),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true))))
    this.runtime.runSync(Effect.void)
  }
  run(ctx:ExecutorContext,events:ExecutorEvents):ExecutorRun {
    const handle=runLegacySync(this.runtime,Effect.flatMap(TaskExecutor,executor=>executor.run(ctx,executorSink(events))),captureError)
    return {cancel:timeout=>runLegacyPromise(this.runtime,handle.cancel(timeout),captureError),pause:()=>runLegacyPromise(this.runtime,handle.pause,captureError)}
  }
}
