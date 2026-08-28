import type { SystemProfileInput } from '@vidbee/i18n/system-locale'
import { app } from 'electron'

/**
 * Collect OS language and country hints from Electron after `app.ready`.
 */
export const readElectronLocaleHints = (): SystemProfileInput => {
  const locales: string[] = []
  let countryCode: string | undefined
  try {
    if (typeof app.getPreferredSystemLanguages === 'function') {
      locales.push(...app.getPreferredSystemLanguages())
    }
  } catch {
    // Preferred languages are unavailable before ready or on older Electron.
  }
  try {
    locales.push(app.getLocale())
  } catch {
    // getLocale() can throw if userData is not ready.
  }
  try {
    if (typeof app.getLocaleCountryCode === 'function') {
      countryCode = app.getLocaleCountryCode() || undefined
    }
  } catch {
    countryCode = undefined
  }
  return { countryCode, locales: locales.filter(Boolean) }
}
