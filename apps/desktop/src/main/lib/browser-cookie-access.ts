import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseBrowserCookiesSetting } from '@vidbee/downloader-core/browser-cookies-setting'
import {
  getBrowserCookieDatabaseRelativeSegments,
  getBrowserProfileBaseDirs,
  getBrowserProfileCandidates
} from '@vidbee/downloader-core/cookie-browser-paths'
import {
  type CookieHealth,
  isBrowserCookieReadSupported,
  MACOS_BROWSER_COOKIE_PERMISSION_MESSAGE
} from '@vidbee/downloader-core/cookie-setup'
import { resolvePathWithHome } from '../utils/path-helpers'

export type CookieDatabaseProbeResult = 'ok' | 'denied' | 'missing'

/**
 * True when a Node fs error is a permission denial.
 *
 * @param error Caught filesystem error.
 */
export const isFsPermissionDenied = (error: unknown): boolean => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }
  const code = String(error.code)
  return code === 'EACCES' || code === 'EPERM'
}

/**
 * Try to open cookie database candidates so macOS can prompt for Files & Folders.
 *
 * @param cookieDbPaths Absolute cookie database paths to probe.
 */
export const probeCookieDatabasePaths = (cookieDbPaths: string[]): CookieDatabaseProbeResult => {
  let sawPermissionDenied = false
  for (const cookieDbPath of cookieDbPaths) {
    try {
      const handle = fs.openSync(cookieDbPath, 'r')
      fs.closeSync(handle)
      return 'ok'
    } catch (error) {
      if (isFsPermissionDenied(error)) {
        sawPermissionDenied = true
      }
    }
  }
  return sawPermissionDenied ? 'denied' : 'missing'
}

/**
 * Strip quotes and surrounding whitespace from a profile field.
 *
 * @param value Raw profile input.
 */
const normalizeProfileInput = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '')

/**
 * True when the path exists and is a directory.
 *
 * @param target Path to test.
 */
const isDirectory = (target: string): boolean => {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

/**
 * Return the first existing directory from a candidate list.
 *
 * @param paths Candidate directories.
 */
const pickFirstDirectory = (paths: string[]): string => {
  for (const candidate of paths) {
    if (isDirectory(candidate)) {
      return candidate
    }
  }
  return ''
}

/**
 * Pick the default Firefox profile folder under a Profiles directory.
 *
 * @param profilesDir Firefox Profiles directory.
 */
const findFirefoxProfilePath = (profilesDir: string): string => {
  if (!isDirectory(profilesDir)) {
    return ''
  }

  try {
    const entries = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))

    const preferred =
      entries.find((name) => name.endsWith('.default-release')) ??
      entries.find((name) => name.endsWith('.default')) ??
      entries[0]

    return preferred ? path.join(profilesDir, preferred) : ''
  } catch {
    return ''
  }
}

/**
 * Resolve a stored profile name or path to a directory, if one exists.
 *
 * @param browser Browser id.
 * @param profile Profile name or path.
 */
export const resolveBrowserProfileDirectory = (browser: string, profile: string): string => {
  const platform = os.platform()
  const homeDir = os.homedir()
  const normalizedInput = normalizeProfileInput(profile)
  const resolvedInput = resolvePathWithHome(normalizedInput)
  if (resolvedInput && isDirectory(resolvedInput)) {
    return resolvedInput
  }

  if (browser === 'firefox') {
    const profilesDir = getBrowserProfileBaseDirs(platform, homeDir, browser)[0]
    const firefoxProfile = profilesDir ? findFirefoxProfilePath(profilesDir) : ''
    if (firefoxProfile) {
      return firefoxProfile
    }
  }

  if (normalizedInput) {
    const baseDirs = getBrowserProfileBaseDirs(platform, homeDir, browser)
    for (const baseDir of baseDirs) {
      const candidate = path.join(baseDir, normalizedInput)
      if (isDirectory(candidate)) {
        return candidate
      }
    }
  }

  return pickFirstDirectory(getBrowserProfileCandidates(platform, homeDir, browser))
}

/**
 * Absolute cookie database paths inside a resolved profile directory.
 *
 * @param browser Browser id.
 * @param profileDir Resolved profile directory.
 */
export const getBrowserCookieDatabasePaths = (browser: string, profileDir: string): string[] =>
  getBrowserCookieDatabaseRelativeSegments(browser).map((segments) =>
    path.join(profileDir, ...segments)
  )

/**
 * Inspect whether VidBee can read cookies from a browser profile.
 *
 * @param browser Browser id.
 * @param profile Profile name or path.
 */
export const inspectBrowserCookieAccess = (browser: string, profile: string): CookieHealth => {
  const platform = os.platform()
  if (!isBrowserCookieReadSupported(platform, browser)) {
    return {
      browser,
      reason: 'unsupported-browser',
      source: 'browser',
      status: 'invalid',
      sites: []
    }
  }

  const resolvedProfile = resolveBrowserProfileDirectory(browser, profile)
  if (!resolvedProfile) {
    return {
      browser,
      reason: 'missing-profile',
      source: 'browser',
      status: 'invalid',
      sites: []
    }
  }

  const probe = probeCookieDatabasePaths(getBrowserCookieDatabasePaths(browser, resolvedProfile))
  if (probe === 'ok') {
    return {
      browser,
      source: 'browser',
      status: 'ok',
      sites: []
    }
  }
  if (probe === 'denied' && platform === 'darwin') {
    return {
      browser,
      reason: 'macos-files-permission',
      source: 'browser',
      status: 'invalid',
      sites: []
    }
  }
  return {
    browser,
    reason: 'missing-cookie-db',
    source: 'browser',
    status: 'invalid',
    sites: []
  }
}

/**
 * Build a classifiable error when macOS blocks browser cookie reads.
 *
 * @param browser Browser id.
 */
export const formatMacosBrowserCookiePermissionError = (browser?: string): string => {
  const label = browser?.trim() && browser !== 'none' ? browser : 'browser'
  return `ERROR: could not find ${label} cookies database\n${MACOS_BROWSER_COOKIE_PERMISSION_MESSAGE}`
}

/**
 * Probe the configured browser cookies source before spawning yt-dlp.
 * Returns an error string when macOS Files & Folders access is denied.
 *
 * @param browserForCookies Raw `browserForCookies` setting.
 */
export const probeConfiguredBrowserCookieAccess = (
  browserForCookies: string | undefined
): string | null => {
  if (os.platform() !== 'darwin') {
    return null
  }
  const { browser, profile } = parseBrowserCookiesSetting(browserForCookies)
  if (!browser || browser === 'none') {
    return null
  }
  const health = inspectBrowserCookieAccess(browser, profile)
  if (health.reason === 'macos-files-permission') {
    return formatMacosBrowserCookiePermissionError(health.browser)
  }
  return null
}
