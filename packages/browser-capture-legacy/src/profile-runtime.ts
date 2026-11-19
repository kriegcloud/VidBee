import { CaptureHost } from '../../browser-capture/src/CaptureHost.service.js'
import { resolveBrowserExecutable, isBrowserCaptureAvailable } from './availability.js'
import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import { BrowserProfiles } from '../../browser-capture/src/BrowserProfiles.service.js'
import { browserProfilesLayer } from '../../browser-capture/src/BrowserProfiles.layer.js'
import { PlaywrightLive } from '../../browser-capture/src/Playwright.driver.js'
import { BrowserCallbacks } from '../../browser-capture/src/Playwright.service.js'
import type { BrowserProfileAdapter } from '../../browser-capture/src/onlyfans-profile.js'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { makeCapturePlatformLayer } from './CapturePlatform.layer.js'
import { makeMediaTransportLayer } from './MediaTransport.layer.js'
import { ProfileCodecLegacy, profileHostLayer } from './ProfileHost.layer.js'
import { captureError } from './errors.js'

export const makeProfileRuntime=(storageDir:string,defaultDirectory:()=>string,adapter:BrowserProfileAdapter):ManagedRuntime.ManagedRuntime<BrowserProfiles,never>=>{
  let runtime:ManagedRuntime.ManagedRuntime<BrowserProfiles,never>
  const basePlatform=makeCapturePlatformLayer(()=>runtime,captureError)
  const host=Layer.effect(CaptureHost,Effect.map(CaptureHost,host=>({...host,browser:(preference?:string)=>Effect.sync(()=>resolveBrowserExecutable(preference)),available:Effect.sync(()=>isBrowserCaptureAvailable())}))).pipe(Layer.provide(basePlatform))
  const platform=Layer.merge(basePlatform,host)
  const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
  const callbacks=Layer.succeed(BrowserCallbacks,{sync:effect=>{runLegacySync(runtime,effect,captureError)},promise:effect=>runLegacyPromise(runtime,effect,captureError)})
  const playwright=PlaywrightLive.pipe(Layer.provide(Layer.mergeAll(platform,timing,callbacks)))
  runtime=ManagedRuntime.make(browserProfilesLayer({storageDir,adapter}).pipe(Layer.provide(Layer.mergeAll(platform,playwright,timing,ProfileCodecLegacy,profileHostLayer(defaultDirectory),makeMediaTransportLayer(()=>runtime,captureError))),Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield,true))))
  runtime.runSync(Effect.void)
  return runtime
}
