import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashSet from 'effect/HashSet'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as References from 'effect/References'
import { failure } from '../../renderer/src/transport/DocumentDelivery.errors'
import { DesktopLogSink } from '../../shared/logging/DesktopLog.service'
import { DesktopLoggerLive } from '../../shared/logging/DesktopLogger.layer'
import { makeFoundationEvents } from '../FoundationEvents.service'
import { makeFoundationHosts } from '../FoundationHosts.driver'
import { makeAdmission } from '../ipc/ElectronRpcAdmission.service'
import { AppLive } from '../ipc/services/app-service'
import { WindowLive } from '../ipc/services/window-service'
import { unwrapOriginal } from '../lib/OriginalFailure.errors'
import type { SynchronousCall } from '../lib/SynchronousHost.service'
import { makeOperations } from '../runtime/ApplicationOperations.layer'
import { ApplicationOperations } from '../runtime/ApplicationOperations.service'
import { legacyPromise } from '../runtime/LegacyEffect.entry'
import { makeSynchronousHost } from '../runtime/SynchronousHost.entry'
import { SettingsLive } from '../Settings.layer'
import type { SettingsApplicationPrimitives } from '../SettingsApplication.service'

export const foundationEvents = makeFoundationEvents()
export const foundationHosts = makeFoundationHosts()
const logging = DesktopLoggerLive.pipe(
  Layer.provide(Layer.succeed(DesktopLogSink, { emit: foundationHosts.logging.emit }))
)
export const foundationAdmission = makeAdmission()
let settingsEffects:
  | ((entries: ReadonlyArray<readonly [string, unknown]>) => SettingsApplicationPrimitives)
  | undefined
export const installSettingsEffects = (factory: NonNullable<typeof settingsEffects>): void => {
  settingsEffects = factory
}
export const nativeSettingsEffects = (
  entries: ReadonlyArray<readonly [string, unknown]>
): SettingsApplicationPrimitives => {
  if (!settingsEffects) {
    throw new Error('Settings application host not installed')
  }
  return settingsEffects(entries)
}
export const foundationRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    SettingsLive.pipe(Layer.provide(foundationHosts.settings.layer)),
    AppLive.pipe(Layer.provide(foundationHosts.app.layer)),
    WindowLive.pipe(Layer.provide(foundationHosts.window.layer)),
    Layer.effect(ApplicationOperations)(makeOperations(foundationAdmission.operationAccount)),
    logging,
    Layer.succeed(References.PreventSchedulerYield, true)
  )
)
const synchronous = makeSynchronousHost({
  runtime: foundationRuntime,
  ...foundationAdmission.synchronousAccount('foundation-host')
})
export const runFoundation = <A, E>(
  operation: (call: SynchronousCall) => Effect.Effect<A, E>
): A => {
  try {
    return synchronous.run(operation)
  } catch (error) {
    throw unwrapOriginal(error)
  }
}
let legacyNativeOpen = true
let legacyNativeTasks = HashSet.empty<Deferred.Deferred<void, unknown>>()
export const closeLegacyNativeAdmission = (): void => {
  legacyNativeOpen = false
}
export const drainLegacyNative = Effect.suspend(() =>
  Effect.forEach(legacyNativeTasks, Deferred.await, { concurrency: 1, discard: true })
)
export const runFoundationPromise = <A, E>(
  operation: (call: SynchronousCall) => Effect.Effect<A, E>
): Promise<A> => {
  if (!legacyNativeOpen) {
    return Promise.reject(failure('NativeClosed'))
  }
  // Old invoke channels retain their original admission contract. Track actual
  // completion for shutdown without borrowing the new transport's window quota.
  const completed = Deferred.makeUnsafe<void, unknown>()
  legacyNativeTasks = HashSet.add(legacyNativeTasks, completed)
  const cleanups: Array<() => void> = []
  let active = true
  const call: SynchronousCall = {
    use: (body) => {
      if (!active) {
        throw new Error('Native call revoked')
      }
      return body()
    },
    cleanup: (release) => {
      cleanups.push(release)
    }
  }
  return legacyPromise({
    runtime: foundationRuntime,
    effect: operation(call).pipe(
      Effect.uninterruptible,
      Effect.ensuring(
        Effect.flatMap(
          Effect.exit(
            Effect.sync(() => {
              active = false
              for (const release of cleanups) {
                release()
              }
            })
          ),
          (exit) =>
            Effect.sync(() => {
              if (Exit.isSuccess(exit)) {
                legacyNativeTasks = HashSet.remove(legacyNativeTasks, completed)
              }
              Deferred.doneUnsafe(completed, exit)
            }).pipe(
              Effect.andThen(Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.void)
            )
        )
      )
    )
  })
}
