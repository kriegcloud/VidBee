import { atom, type Getter, type Setter } from 'jotai'
import type { AppSettings } from '../../../shared/types'
import i18n from '../i18n'
import { getDesktopDocument } from '../legacy/document'
import { foundationEffects, isFoundationDeparture, runFoundationEffect } from '../lib/foundation'
import { projectFoundationAtom } from '../lib/foundation-state'
import { logger } from '../lib/logger'
import { makePreferenceHost } from '../runtime/Preferences.driver'
import { makeSettingsActions } from '../runtime/Settings.atoms'

// Settings atom
export const settingsAtom = projectFoundationAtom(getDesktopDocument().atoms.settings)
export const settingsLoadedAtom = projectFoundationAtom(getDesktopDocument().atoms.settingsLoaded)
export const enableDownloadNotificationsAtom = atom(
  (get) => get(settingsAtom).enableDownloadNotifications
)

const observeFailure =
  (message: string) =>
  (error: unknown): void => {
    if (!isFoundationDeparture(error)) {
      logger.error(message, error)
    }
  }
// Legacy Jotai actions only bind their write seam to the strict action owner.
const host = makePreferenceHost({
  language: () => i18n.language,
  changeLanguage: (language) => i18n.changeLanguage(language),
  report: (message, error) => logger.error(message, error)
})
const actions = (get: Getter, set: Setter) =>
  makeSettingsActions({
    state: {
      read: () => get(settingsAtom),
      write: (value) => set(settingsAtom, value),
      loaded: () => set(settingsLoadedAtom, true),
      capture: (value) => {
        const snapshot = getDesktopDocument().storage.capture(
          getDesktopDocument().atoms.settings,
          value
        )
        return {
          release: snapshot.release,
          restore: () => {
            snapshot.restore()
            set(settingsAtom, value)
          }
        }
      }
    },
    calls: foundationEffects().settings,
    host
  })
export const loadSettingsAtom = atom(null, (get, set) =>
  runFoundationEffect(actions(get, set).load, observeFailure('Failed to load settings:'))
)
export const saveSettingAtom = atom(
  null,
  (get, set, update: { key: keyof AppSettings; value: AppSettings[keyof AppSettings] }) => {
    const prepared = actions(get, set).prepareSave(update)
    return runFoundationEffect(prepared.effect, (error) => {
      try {
        prepared.refuse(!isFoundationDeparture(error))
      } catch (rollbackError) {
        logger.error('Failed to save setting:', rollbackError)
      }
      observeFailure('Failed to save setting:')(error)
    })
  }
)
export const saveAllSettingsAtom = atom(null, (get, set, settings: Partial<AppSettings>) =>
  runFoundationEffect(
    actions(get, set).saveAll({ entries: Object.entries(settings), settings }),
    observeFailure('Failed to save settings:')
  )
)
