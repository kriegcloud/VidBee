import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { Playback } from '../../browser-capture/src/Playback.service.js'
import { PlaybackLive } from '../../browser-capture/src/Playback.layer.js'
import { BrowserCallbacks } from '../../browser-capture/src/Playwright.service.js'
import { PlaywrightLive } from '../../browser-capture/src/Playwright.driver.js'
import { captureError as playbackError } from './errors.js'
import { makeCapturePlatformLayer } from './CapturePlatform.layer.js'

export { captureError as playbackError } from './errors.js'
export const makePlaybackLayer = <R, ER>(runtime: () => ManagedRuntime.ManagedRuntime<R, ER>, mapError: (cause: Cause.Cause<unknown>) => unknown) => {
  const callbacks = Layer.succeed(BrowserCallbacks, {
    sync: effect => { runLegacySync(runtime(), effect, mapError) },
    promise: effect => runLegacyPromise(runtime(), effect, mapError)
  })
  const timing = Layer.succeed(LegacyTiming, {turn: () => Effect.callback<void>(resume => {queueMicrotask(() => resume(Effect.void))})})
  const platform = makeCapturePlatformLayer(runtime, mapError).pipe(Layer.provideMerge(timing))
  const driver = PlaywrightLive.pipe(Layer.provide(Layer.merge(platform, callbacks)))
  return PlaybackLive.pipe(Layer.provideMerge(Layer.mergeAll(platform, driver)), Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield, true)))
}
let owner: ManagedRuntime.ManagedRuntime<Playback, never>
owner = ManagedRuntime.make(makePlaybackLayer(() => owner, playbackError))
owner.runSync(Effect.void)
export const playbackRuntime = owner
