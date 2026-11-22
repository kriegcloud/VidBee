// Preserve the original native module evaluation order while strict implementations live behind compatibility facades.
import './services/account-service'
import './services/ai-service'
import '../legacy/app-service'
import './services/browser-cookies-service'
import './services/download-service'
import './services/file-system-service'
import './services/history-service'
import './services/mcp-service'
import './services/player-service'
import '../legacy/settings-service'
import './services/subscription-service'
import './services/thumbnail-service'
import './services/transcript-service'
import '../legacy/window-service'

import { type IpcMainInvokeEvent, ipcMain } from 'electron'
import { createServices, type MergeIpcService } from 'electron-ipc-decorator'
import { AppService } from '../legacy/app-service'
import { SettingsService } from '../legacy/settings-service'
import { WindowService } from '../legacy/window-service'
import { AccountService } from './services/account-service'
import { AiService } from './services/ai-service'
import { BrowserCookiesService } from './services/browser-cookies-service'
import { DownloadService } from './services/download-service'
import { FileSystemService } from './services/file-system-service'
import { HistoryService } from './services/history-service'
import { McpService } from './services/mcp-service'
import { PlayerService } from './services/player-service'
import { SubscriptionService } from './services/subscription-service'
import { ThumbnailService } from './services/thumbnail-service'
import { TranscriptService } from './services/transcript-service'

/**
 * Replace a live channel instead of throwing, so main HMR can attach methods
 * added after the first `createServices()` call.
 */
const registerIpcHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = ((
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
) => {
  ipcMain.removeHandler(channel)
  return registerIpcHandle(channel, listener)
}) as typeof ipcMain.handle

// Create services with automatic type inference
const beforeApp = createServices([AccountService, AiService])
const appService = new AppService()
const beforeSettings = createServices([
  BrowserCookiesService,
  DownloadService,
  FileSystemService,
  HistoryService,
  McpService,
  PlayerService
])
const settingsService = new SettingsService()
const beforeWindow = createServices([SubscriptionService, ThumbnailService, TranscriptService])
const windowService = new WindowService()
export const services = {
  ...beforeApp,
  app: appService,
  ...beforeSettings,
  settings: settingsService,
  ...beforeWindow,
  window: windowService
}

ipcMain.removeHandler('fs.saveMarkdownPdf')
ipcMain.handle('fs.saveMarkdownPdf', (event, options) =>
  services.fs.saveMarkdownPdf({ event, sender: event.sender }, options)
)

// Generate type definition for all services
export type IpcServices = MergeIpcService<typeof services>
