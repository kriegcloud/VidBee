import type { IpcContext } from 'electron-ipc-decorator'
import type { AppSettings } from '../../shared/types'
import { settingsApplication } from '../ipc/services/settings-service'
import { updateDesktopSettings } from '../lib/settings-host'
import { applyDesktopQueueConcurrency } from '../lib/task-queue-host'
import { applyAutoLaunchSetting } from '../utils/auto-launch'
import { applyDockVisibility } from '../utils/dock'
import { registerLegacy } from './registrar'
import { runSettings, settingsManager } from './settings'

class SettingsService {
  static readonly groupName = 'settings'

  constructor() {
    registerLegacy('settings.get', this.get.bind(this))
    registerLegacy('settings.set', this.set.bind(this))
    registerLegacy('settings.getAll', this.getAll.bind(this))
    registerLegacy('settings.setAll', this.setAll.bind(this))
    registerLegacy('settings.reset', this.reset.bind(this))
    registerLegacy('settings.shouldPromptWhatsNew', this.shouldPromptWhatsNew.bind(this))
    registerLegacy('settings.markWhatsNewSeen', this.markWhatsNewSeen.bind(this))
  }

  get<K extends keyof AppSettings>(_context: IpcContext, key: K): AppSettings[K] {
    return settingsManager.get(key)
  }

  set<K extends keyof AppSettings>(_context: IpcContext, key: K, value: AppSettings[K]): void {
    updateDesktopSettings({ [key]: value })
  }

  getAll(_context: IpcContext): AppSettings {
    return settingsManager.getAll()
  }

  setAll(_context: IpcContext, settings: Partial<AppSettings>): void {
    updateDesktopSettings(settings)
  }

  reset(_context: IpcContext): void {
    runSettings(
      (settings, call) =>
        settingsApplication({
          settings,
          call,
          native: {
            entries: () => [],
            keys: () => [],
            needsFollowup: () => false,
            language: () => {},
            followup: () => {},
            broadcast: () => {},
            dock: (value) => {
              Reflect.apply(applyDockVisibility, undefined, [value])
            },
            login: (value) => {
              Reflect.apply(applyAutoLaunchSetting, undefined, [value])
            },
            queue: applyDesktopQueueConcurrency
          }
        }).reset
    )
  }

  /**
   * True when a returning user should see the current What's New card.
   */
  shouldPromptWhatsNew(_context: IpcContext): boolean {
    return settingsManager.shouldPromptWhatsNew()
  }

  /**
   * Record that the current What's New card has been dismissed.
   */
  markWhatsNewSeen(_context: IpcContext): void {
    settingsManager.markWhatsNewSeen()
  }
}

export { SettingsService }
