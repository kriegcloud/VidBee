import type { Executor, ExecutorContext, ExecutorEvents, ExecutorRun } from '@vidbee/task-queue-legacy'
import { runLegacySync, runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { TaskExecutor } from '@vidbee/task-queue/TaskExecutor.service'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { DrmFallbackDependencies, DrmFallbackExecutorLive } from '../../browser-capture/src/drm-fallback.js'
import { isBrowserCaptureAvailable } from './availability.js'
import { executorBridge, executorSink } from './executor-bridge.js'
import { captureError } from './errors.js'

export class DrmFallbackExecutor implements Executor {
  private readonly runtime: ManagedRuntime.ManagedRuntime<TaskExecutor,never>
  constructor(primary:Executor,capture:Executor,isAvailable:()=>boolean=isBrowserCaptureAvailable) {
    this.runtime=ManagedRuntime.make(DrmFallbackExecutorLive.pipe(Layer.provide(Layer.succeed(DrmFallbackDependencies,{
      primary:executorBridge(primary,()=>this.runtime,captureError),
      capture:executorBridge(capture,()=>this.runtime,captureError),
      available:Effect.sync(()=>isAvailable.call(this)),
    })),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true))))
    this.runtime.runSync(Effect.void)
  }
  run(ctx:ExecutorContext,events:ExecutorEvents):ExecutorRun {
    const handle=runLegacySync(this.runtime,Effect.flatMap(TaskExecutor,executor=>executor.run(ctx,executorSink(events))),captureError)
    return {cancel:timeout=>runLegacyPromise(this.runtime,handle.cancel(timeout),captureError),pause:()=>runLegacyPromise(this.runtime,handle.pause,captureError)}
  }
}
