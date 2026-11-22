import { BrowserWindow } from 'electron'
import type { AppSettings } from '../../shared/types'
import { publishFoundationSettings } from '../legacy/foundation-events'
import { installSettingsEffects } from '../legacy/foundation-runtime'
import { makeSettingsApplication } from '../SettingsApplication.service'
import { runSettings } from '../settings.compatibility'
import { applyAutoLaunchSetting } from '../utils/auto-launch'
import { applyDockVisibility } from '../utils/dock'
import { refreshAppIconMenus } from './app-icon-menu'
import { applyDesktopQueueConcurrency } from './task-queue-host'

/** Publish changes made outside the settings screen to every open renderer. */
export function broadcastSettingsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('settings:changed')
    publishFoundationSettings(window.webContents)
  }
}

/** Persist UI and Agent edits through the same application side effects. */
export function updateDesktopSettings(settings: Partial<AppSettings>): void {
  runSettings(
    (service, call) =>
      makeSettingsApplication({
        settings: service,
        call,
        native: nativeSettingsApplication(settings)
      }).update
  )
}

const nativeSettingsApplication = (settings: Partial<AppSettings>) => ({
  entries: () => Object.entries(settings),
  keys: () => Object.keys(settings),
  needsFollowup: () => settings.transcriptionProvider !== undefined,
  language: refreshAppIconMenus,
  dock: (value: unknown) => {
    Reflect.apply(applyDockVisibility, undefined, [value])
  },
  login: (value: unknown) => {
    Reflect.apply(applyAutoLaunchSetting, undefined, [value])
  },
  queue: applyDesktopQueueConcurrency,
  followup: () => {
    void import('./transcript-host').then(
      ({ flushDeferredAutoTranscriptions, startIdleMinimalModelFill }) => {
        startIdleMinimalModelFill()
        flushDeferredAutoTranscriptions()
      }
    )
  },
  broadcast: broadcastSettingsChanged
})
installSettingsEffects((entries) => {
  const captured = Object.fromEntries(entries)
  return { ...nativeSettingsApplication(captured), entries: () => entries }
})
