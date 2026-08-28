import { createServices, type MergeIpcService } from 'electron-ipc-decorator'
import { AiService } from './services/ai-service'
import { AppService } from './services/app-service'
import { BrowserCookiesService } from './services/browser-cookies-service'
import { DownloadService } from './services/download-service'
import { FileSystemService } from './services/file-system-service'
import { HistoryService } from './services/history-service'
import { PlayerService } from './services/player-service'
import { SettingsService } from './services/settings-service'
import { SubscriptionService } from './services/subscription-service'
import { ThumbnailService } from './services/thumbnail-service'
import { TranscriptService } from './services/transcript-service'
import { UpdateService } from './services/update-service'
import { WindowService } from './services/window-service'

// Create services with automatic type inference
export const services = createServices([
  AiService,
  AppService,
  BrowserCookiesService,
  DownloadService,
  FileSystemService,
  HistoryService,
  PlayerService,
  SettingsService,
  SubscriptionService,
  ThumbnailService,
  TranscriptService,
  UpdateService,
  WindowService
])

// Generate type definition for all services
export type IpcServices = MergeIpcService<typeof services>
