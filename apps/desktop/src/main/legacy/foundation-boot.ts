import { randomUUID } from 'node:crypto'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Scheduler from 'effect/Scheduler'
import { ipcMain } from 'electron'
import { APP_PROTOCOL_SCHEME } from '../../shared/constants'
import { runFoundationServer } from '../FoundationServer.entry'
import { makeElectronWire } from '../ipc/ElectronRpcServer.driver'
import { registerFoundationDisposal } from '../lib/foundation-disposal'
import { ApplicationOperations } from '../runtime/ApplicationOperations.service'
import {
  closeLegacyNativeAdmission,
  drainLegacyNative,
  foundationAdmission,
  foundationEvents,
  foundationRuntime,
  nativeSettingsEffects
} from './foundation-runtime'
import { foundationWindowRole } from './foundation-windows'

let server: ReturnType<typeof foundationRuntime.runFork> | undefined
let stopping: Promise<void> | undefined
export const startFoundationTransport = (): void => {
  if (server) {
    return
  }
  const wire = makeElectronWire({
    ipc: ipcMain,
    authority: {
      packagedRendererUrl: `${APP_PROTOCOL_SCHEME}renderer/index.html`,
      ...(process.env.ELECTRON_RENDERER_URL
        ? { developmentRendererUrl: process.env.PORTLESS_URL || process.env.ELECTRON_RENDERER_URL }
        : {}),
      registeredRole: foundationWindowRole,
      allowsProcedure: (role, tag) =>
        role === 'visible' ||
        tag === 'App.GetPlatform' ||
        tag === 'App.GetVersion' ||
        tag === 'Settings.WatchChanged' ||
        tag === 'Settings.Get' ||
        tag === 'Settings.GetAll'
    }
  })
  let ready = false
  const running = foundationRuntime.runFork(
    runFoundationServer({
      wire,
      admission: foundationAdmission,
      handlers: {
        events: foundationEvents,
        settingsNative: nativeSettingsEffects,
        epoch: randomUUID()
      },
      ready: () => {
        ready = true
      }
    }),
    { scheduler: new Scheduler.MixedScheduler('sync') }
  )
  running.currentDispatcher.flush()
  if (!ready) {
    running.interruptUnsafe()
    throw new Error('Foundation transport failed to initialize')
  }
  server = running
  registerFoundationDisposal(stopFoundationTransport)
}
export const stopFoundationTransport = (): Promise<void> => {
  stopping ??= foundationRuntime
    .runPromise(
      Effect.gen(function* () {
        const operations = yield* ApplicationOperations
        closeLegacyNativeAdmission()
        yield* operations.closeAdmission
        if (server) {
          yield* Fiber.interrupt(server)
        }
        yield* operations.drain
        yield* drainLegacyNative
      })
    )
    .then(() => foundationRuntime.dispose())
  return stopping
}
