import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectSystemProfile } from '@vidbee/i18n/legacy/system-locale'
import type * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import type StoreType from 'electron-store'
import type { AppSettings } from '../../shared/types'
import { defaultSettings } from '../../shared/types'
import type { SynchronousCall } from '../lib/SynchronousHost.service'
import { readElectronLocaleHints } from '../lib/system-locale'
import {
  getPortableDownloadsPath,
  isPortableMode,
  portableRoot,
  previousPortableRoot,
  rememberPortableRoot
} from '../portable'
import { DesktopSettings, type SettingsOperations } from '../Settings.service'
import { logger, scopedLoggers } from '../utils/logger'
import { foundationHosts, foundationRuntime, runFoundation } from './foundation-runtime'

// Preserve the installed CommonJS/default constructor selection at the old import-time boundary.
const required: unknown = require('electron-store')
const candidate =
  typeof required === 'object' && required !== null && 'default' in required
    ? required.default
    : required
const StoreConstructor = S.declare(
  (value: unknown): value is typeof StoreType => typeof value === 'function'
)
const Store = S.decodeUnknownSync(StoreConstructor)(candidate)
const StoreInstance = S.declare(
  (value: unknown): value is StoreType<Record<string, unknown>> => value instanceof Store
)
const oldDefaultPath = path.join(os.homedir(), 'Downloads')
const defaultPath = isPortableMode
  ? getPortableDownloadsPath()
  : path.join(os.homedir(), 'Downloads', 'VidBee')
const effectiveDefaults = {
  ...defaultSettings,
  downloadPath: defaultPath,
  launchAtLogin: isPortableMode ? false : defaultSettings.launchAtLogin
}
foundationHosts.settings.install({
  open: () => {
    let storePath: string | null
    try {
      storePath = path.join(appPath(), 'config.json')
    } catch {
      storePath = null
    }
    const hadExistingStore = Boolean(storePath && fs.existsSync(storePath))
    const store = S.decodeUnknownSync(StoreInstance)(
      Reflect.construct(Store, [
        { cwd: storePath ? path.dirname(storePath) : undefined, defaults: effectiveDefaults }
      ])
    )
    return {
      environment: {
        effectiveDefaults,
        defaultDownloadPath: defaultPath,
        oldDefaultDownloadPath: oldDefaultPath,
        portable: isPortableMode,
        portableRoot,
        previousPortableRoot,
        hadExistingStore
      },
      get: (key) => store.get(key),
      document: () => store.store,
      set: (key, value) => {
        store.set(key, value)
      },
      replace: (value) => {
        store.set(value)
      },
      clear: () => store.clear()
    }
  },
  mkdir: (value) => {
    Reflect.apply(fs.mkdirSync, fs, [value, { recursive: true }])
  },
  rememberPortableRoot,
  locale: () => detectSystemProfile(readElectronLocaleHints()),
  resolve: (value) => S.decodeUnknownSync(S.String)(Reflect.apply(path.resolve, path, [value])),
  relative: (from, to) =>
    S.decodeUnknownSync(S.String)(Reflect.apply(path.relative, path, [from, to])),
  join: (from, to) => S.decodeUnknownSync(S.String)(Reflect.apply(path.join, path, [from, to])),
  isAbsolute: (value) =>
    S.decodeUnknownSync(S.Boolean)(Reflect.apply(path.isAbsolute, path, [value])),
  trim: (value) => S.decodeUnknownSync(S.String)(Reflect.apply(Str.trim, undefined, [value]))
})

// Electron remains an injected native dependency in the legacy composition boundary.
import { app } from 'electron'

const appPath = () => app.getPath('userData')
foundationHosts.logging.install((entry) => {
  const target = entry.scope === 'system' ? scopedLoggers.system : logger
  target[entry.level](...entry.args)
})
const core = foundationRuntime.runSync(DesktopSettings)
export const runSettings = <A, E>(
  operation: (settings: SettingsOperations, call: SynchronousCall) => Effect.Effect<A, E>
): A => runFoundation((call) => operation(core.forCall(call), call))
class SettingsManager {
  constructor() {
    runSettings((settings) => settings.initialize)
  }
  get<K extends keyof AppSettings>(key: K): AppSettings[K]
  get(key: keyof AppSettings): unknown {
    return runSettings((settings) => settings.get(key))
  }
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    runSettings((settings) => settings.set(key, value))
  }
  getAll(): AppSettings
  getAll(): unknown {
    return runSettings((settings) => settings.getAll)
  }
  setAll(settings: Partial<AppSettings>): void {
    const entries = Object.entries(settings)
    runSettings((service) => service.setAll(entries))
  }
  reset(): void {
    runSettings((settings) => settings.reset)
  }
  applyFreshInstallLocale(): void {
    runSettings((settings) => settings.freshLocale)
  }
  shouldPromptWhatsNew(): boolean {
    return runSettings((settings) => settings.shouldPromptWhatsNew)
  }
  markWhatsNewSeen(): void {
    runSettings((settings) => settings.markWhatsNewSeen)
  }
}
/** Existing synchronous manager identity. Construction and repairs still run during the importing module's evaluation.
 * **Example** (Keep an unported synchronous caller)
 * ```ts
 * import { settingsManager } from './settings.js'
 * const theme = settingsManager.get('theme')
 * typeof theme // => the original raw or normalized value's type, with no new semantic decoder
 * ```
 * @category interop
 * @since 0.0.0
 */
export const settingsManager = new SettingsManager()
