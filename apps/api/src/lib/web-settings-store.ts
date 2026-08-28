import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type DownloadRuntimeSettings, WebAppSettingsSchema } from '@vidbee/downloader-core'
import { DEFAULT_SUBTITLE_LANGUAGES } from '@vidbee/downloader-core/subtitle-languages'

const STORAGE_DIR = path.resolve(process.cwd(), '.data')
const STORAGE_FILE = path.join(STORAGE_DIR, 'web-settings.json')

const defaultWebSettings = WebAppSettingsSchema.parse({
  downloadPath: '',
  maxConcurrentDownloads: 5,
  browserForCookies: 'none',
  cookiesPath: '',
  proxy: '',
  configPath: '',
  betaProgram: false,
  language: 'en',
  theme: 'system',
  oneClickDownload: false,
  oneClickDownloadType: 'video',
  oneClickQuality: 'best',
  oneClickContainer: 'auto',
  closeToTray: true,
  autoUpdate: true,
  subscriptionOnlyLatestDefault: true,
  enableAnalytics: true,
  downloadSubtitles: true,
  subtitleLanguages: [...DEFAULT_SUBTITLE_LANGUAGES],
  embedSubs: true,
  writeAutoSubs: true,
  embedThumbnail: false,
  embedMetadata: true,
  embedChapters: true,
  filenameStyle: 'pretty',
  filenameViaVidBee: true,
  shareWatermark: false,
  autoTranscribeAfterDownload: true,
  maxConcurrentTranscriptions: 1,
  asrTier: 'minimal'
})

type WebAppSettings = typeof defaultWebSettings

class WebSettingsStore {
  private settings = defaultWebSettings
  private initialized = false

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.initialized = true

    try {
      const raw = await readFile(STORAGE_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      const result = WebAppSettingsSchema.safeParse(parsed)
      if (result.success) {
        this.settings = result.data
      }
    } catch {
      this.settings = defaultWebSettings
    }
  }

  async get(): Promise<WebAppSettings> {
    await this.ensureInitialized()
    return this.settings
  }

  async set(nextSettings: WebAppSettings): Promise<WebAppSettings> {
    await this.ensureInitialized()
    const validated = WebAppSettingsSchema.parse(nextSettings)
    await mkdir(STORAGE_DIR, { recursive: true })
    await writeFile(STORAGE_FILE, JSON.stringify(validated), 'utf-8')
    this.settings = validated
    return this.settings
  }
}

export const webSettingsStore = new WebSettingsStore()

/**
 * Project stored Web settings onto the settings accepted by the download executor.
 *
 * @param settings Validated Web application settings.
 * @returns Runtime settings for one queued download.
 */
export const toWebDownloadRuntimeSettings = (
  settings: WebAppSettings
): DownloadRuntimeSettings => ({
  downloadPath: settings.downloadPath,
  browserForCookies: settings.browserForCookies,
  cookiesPath: settings.cookiesPath,
  proxy: settings.proxy,
  configPath: settings.configPath,
  downloadSubtitles: settings.downloadSubtitles,
  subtitleLanguages: settings.subtitleLanguages,
  interfaceLanguage: settings.language,
  embedSubs: settings.embedSubs,
  writeAutoSubs: settings.writeAutoSubs,
  embedThumbnail: settings.embedThumbnail,
  embedMetadata: settings.embedMetadata,
  embedChapters: settings.embedChapters,
  filenameStyle: settings.filenameStyle,
  filenameViaVidBee: settings.filenameViaVidBee,
  shareWatermark: settings.shareWatermark
})
