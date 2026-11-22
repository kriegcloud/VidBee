import log from '../utils/logger'
import { stopAllAgentRuns } from './agent-chat-runner'
import { stopAllPromptRuns } from './ai-prompt-runner'
import { takeFoundationDisposal } from './foundation-disposal'
import { allowAppQuit } from './quit-confirmation-host'
import { stopDesktopInstagramProfileMappings } from './task-queue-host'
import { takeTelemetryDisposal } from './telemetry-disposal'

let preparation: Promise<void> | null = null
let prepared = false

/** Check whether an approved quit has started, including update installation. */
export const isAppQuitting = (): boolean => preparation !== null

/** Check whether asynchronous shutdown work has finished. */
export const isAppQuitPrepared = (): boolean => prepared

/** Complete the optional telemetry drain without delaying quit indefinitely. */
const stopTelemetryBeforeQuit = (): Promise<void> | undefined => {
  const dispose = takeTelemetryDisposal()
  if (!dispose) {
    return undefined
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      log.warn('Desktop telemetry shutdown timed out; continuing quit.')
      resolve()
    }, 2000)
  })
  const telemetry = Promise.resolve()
    .then(dispose)
    .catch(() => {
      log.warn('Desktop telemetry shutdown failed; continuing quit.')
    })
  return Promise.race([telemetry, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    prepared = true
  })
}

const finishQuit = (): Promise<void> | undefined => {
  const telemetry = stopTelemetryBeforeQuit()
  if (telemetry) {
    return telemetry
  }
  prepared = true
  return undefined
}
const finishFoundation = (
  foundation: (() => Promise<void>) | undefined
): Promise<void> | undefined => (foundation ? foundation().then(finishQuit) : finishQuit())

/** Stop AI work once before either normal quit or the updater closes windows. */
export const prepareAppQuit = (): Promise<void> => {
  if (!preparation) {
    allowAppQuit()
    preparation = Promise.allSettled([
      stopAllPromptRuns(),
      stopAllAgentRuns(),
      stopDesktopInstagramProfileMappings()
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          log.warn('Failed to stop AI work before quitting:', result.reason)
        }
      }
      const foundation = takeFoundationDisposal()
      return finishFoundation(foundation)
    })
  }
  return preparation
}
