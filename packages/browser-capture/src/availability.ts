import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseBrowserCookiesSetting } from '@vidbee/downloader-core/browser-cookies-setting'
import { VIRTUAL_DISPLAY_SIZE } from './quality'

const LINUX_BROWSER_PATHS: Record<string, readonly string[]> = {
  brave: [
    '/usr/bin/brave',
    '/usr/bin/brave-browser',
    '/usr/bin/brave-browser-stable',
    '/opt/brave.com/brave/brave',
    '/opt/brave.com/brave/brave-browser'
  ],
  chrome: [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chrome',
    '/opt/google/chrome/chrome'
  ],
  chromium: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/lib/chromium/chromium'],
  edge: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']
}

const which = (binary: string): string | null => {
  try {
    const result = spawnSync('which', [binary], { encoding: 'utf8' })
    const found = result.stdout.trim().split(/\r?\n/)[0]
    return found && existsSync(found) ? found : null
  } catch {
    return null
  }
}

const firstExisting = (candidates: readonly string[]): string | null => {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** True when this host can run the virtual-display capture sidecar. */
export const isBrowserCaptureAvailable = (): boolean => {
  if (process.env.VIDBEE_BROWSER_CAPTURE === '0') {
    return false
  }
  if (process.platform !== 'linux') {
    return false
  }
  return Boolean(which('Xvfb') && resolveBrowserExecutable())
}

/** Locate Xvfb. */
export const resolveXvfbPath = (): string | null => which('Xvfb')

/** Locate pactl for a Pulse/PipeWire null sink (optional). */
export const resolvePactlPath = (): string | null => which('pactl')

/**
 * Prefer the cookie-source browser so Widevine and client identity match the
 * session, then fall back to any installed Chromium-family browser.
 */
export const resolveBrowserExecutable = (browserForCookies?: string): string | null => {
  const preferred = parseBrowserCookiesSetting(browserForCookies).browser
  const order = [preferred, 'brave', 'chrome', 'chromium', 'edge'].filter(
    (name, index, all) => name && name !== 'none' && all.indexOf(name) === index
  )
  for (const name of order) {
    const found = firstExisting(LINUX_BROWSER_PATHS[name] ?? []) ?? which(name)
    if (found) {
      return found
    }
  }
  return (
    which('google-chrome-stable') ??
    which('google-chrome') ??
    which('brave') ??
    which('brave-browser') ??
    which('chromium') ??
    which('microsoft-edge')
  )
}

/** Pick a free X display number. */
export const pickDisplayNumber = (): number => {
  for (let display = 90; display < 130; display += 1) {
    const lock = `/tmp/.X${display}-lock`
    const socket = path.join('/tmp', '.X11-unix', `X${display}`)
    if (!(existsSync(lock) || existsSync(socket))) {
      return display
    }
  }
  throw new Error('No free Xvfb display in :90-:129')
}

/** Default capture canvas — large enough for 4K in either orientation. */
export const DEFAULT_CAPTURE_SIZE = VIRTUAL_DISPLAY_SIZE

/** Home directory used when resolving browser profiles. */
export const userHomeDir = (): string => os.homedir()

/** Wait until the virtual screen answers, or the timeout elapses. */
export const waitForDisplay = async (display: string, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const probe = spawnSync('xdpyinfo', ['-display', display], {
      encoding: 'utf8',
      timeout: 1000
    })
    if (probe.status === 0) {
      return
    }
    await delay(50)
  }
}
