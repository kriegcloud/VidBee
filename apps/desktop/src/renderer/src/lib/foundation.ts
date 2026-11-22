import * as Cause from 'effect/Cause'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import type { MessageBoxOptions } from '../../../shared/App.model'
import type { AppSettings } from '../../../shared/types'
import type { ShareCardPayload } from '../../../shared/types/share-card'
import { getDesktopDocument } from '../legacy/document'
import { FoundationAbout } from '../runtime/About.atoms'
import { FoundationClient } from '../runtime/FoundationClient.service'
import { DeliveryError, ElectronRpcTransportError } from '../transport/DocumentDelivery.errors'
import { logger } from './logger'

export const foundationEffects = () => {
  const document = getDesktopDocument()
  return document.calls
}
export const runFoundationEffect = <A, E>(
  effect: Effect.Effect<A, E, FoundationClient | FoundationAbout>,
  recover?: (error: unknown) => A
): Promise<A> => {
  const document = getDesktopDocument()
  const provided = Effect.flatMap(document.runtime.contextEffect, (context) =>
    Effect.provideContext(effect, context)
  )
  if (!recover) {
    return document.owner.invokePromise(provided)
  }
  const result = Promise.withResolvers<A>()
  document.owner.invoke({
    effect: provided,
    settle: (exit) => {
      if (Exit.isSuccess(exit)) {
        result.resolve(exit.value)
        return
      }
      try {
        result.resolve(recover(Cause.squash(exit.cause)))
      } catch (error) {
        result.reject(error)
      }
    }
  })
  return result.promise
}
/** Permanent departure has no mounted preference/metadata consumer left to notify. */
export const isFoundationDeparture = (error: unknown): boolean =>
  error instanceof DeliveryError && error.reason === 'DocumentClosed'
/** Native Promise adapters for legacy React composition; every call executes through the one strict document client graph. */
export const foundationClients = {
  settings: {
    getAll: () => runFoundationEffect(foundationEffects().settings.getAll),
    get: (key: keyof AppSettings) => runFoundationEffect(foundationEffects().settings.get(key)),
    set: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) =>
      runFoundationEffect(foundationEffects().settings.set(key, value)),
    setAll: (settings: Partial<AppSettings>) =>
      runFoundationEffect(foundationEffects().settings.setAll(Object.entries(settings))),
    reset: () => runFoundationEffect(foundationEffects().settings.reset),
    shouldPromptWhatsNew: () =>
      runFoundationEffect(foundationEffects().settings.shouldPromptWhatsNew),
    markWhatsNewSeen: () => runFoundationEffect(foundationEffects().settings.markWhatsNewSeen)
  },
  app: {
    getVersion: () => runFoundationEffect(foundationEffects().app.getVersion),
    getPlatform: () => runFoundationEffect(foundationEffects().app.getPlatform),
    getOsVersion: () => runFoundationEffect(foundationEffects().app.getOsVersion),
    getDownloaderStatus: () => runFoundationEffect(foundationEffects().app.getDownloaderStatus),
    getYtDlpKernelStatus: () => runFoundationEffect(foundationEffects().app.getYtDlpKernelStatus),
    retryYtDlpKernelPreparation: () =>
      runFoundationEffect(foundationEffects().app.retryYtDlpKernelPreparation),
    quit: () => runFoundationEffect(foundationEffects().app.quit),
    showMessageBox: (options: MessageBoxOptions) =>
      runFoundationEffect(foundationEffects().app.showMessageBox(options)),
    getSiteIcon: (domain: string) =>
      runFoundationEffect(foundationEffects().app.getSiteIcon(domain))
  },
  window: {
    minimize: () => runFoundationEffect(foundationEffects().window.minimize),
    maximize: () => runFoundationEffect(foundationEffects().window.maximize),
    close: () => runFoundationEffect(foundationEffects().window.close),
    isMaximized: () => runFoundationEffect(foundationEffects().window.isMaximized),
    captureShareCard: (payload: ShareCardPayload) =>
      runFoundationEffect(foundationEffects().window.captureShareCard(payload)),
    writeShareImage: (data: ArrayBuffer) =>
      runFoundationEffect(foundationEffects().window.writeShareImage(new Uint8Array(data)))
  }
}
/** Compatibility event seam; capability events remain on the old proxy. */
export const foundationEvents = {
  on: (
    channel: 'settings:changed' | 'ytdlp-kernel:status' | 'app:show-home',
    callback: (...args: unknown[]) => void
  ): (() => void) => {
    const document = getDesktopDocument()
    if (channel === 'settings:changed') {
      return document.registry.subscribe(document.atoms.settingsInvalidation, () => callback())
    }
    if (channel === 'ytdlp-kernel:status') {
      return document.registry.subscribe(document.atoms.kernelRevision, () =>
        callback(document.registry.get(document.atoms.kernel))
      )
    }
    const cancelled = Deferred.makeUnsafe<void>()
    document.owner.invoke({
      effect: Effect.flatMap(document.runtime.contextEffect, (context) =>
        Effect.provideContext(
          FoundationClient.use((owner) =>
            owner.transport.consume(owner.client['App.WatchShowHome'](), (event) =>
              Effect.sync(() => {
                if (event._tag === 'Observation') {
                  callback()
                }
                owner.transport.delivery.applied({
                  ...event,
                  through: event._tag === 'Registered' ? 0 : event.sequence
                })
              })
            )
          ),
          context
        )
      ).pipe(Effect.raceFirst(Deferred.await(cancelled))),
      settle: (exit) => {
        if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
          document.failure.report(
            ElectronRpcTransportError.make({
              operation: 'App.WatchShowHome',
              reason: 'SourceClosed',
              message: 'Desktop source connection closed'
            })
          )
        }
      }
    })
    return () => {
      Deferred.doneUnsafe(cancelled, Exit.void)
    }
  },
  removeListener: (_channel: string, release: () => void) => release()
}

export const loadFoundationAppInfo = () =>
  runFoundationEffect(
    FoundationAbout.use((about) => about.load),
    (error) => {
      if (!isFoundationDeparture(error)) {
        logger.error('Failed to load app info for feedback links:', error)
      }
      return { appVersion: '', osVersion: '' }
    }
  )
