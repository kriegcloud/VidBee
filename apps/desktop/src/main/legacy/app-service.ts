import os from 'node:os'
import { app, BrowserWindow, dialog } from 'electron'
import type { IpcContext } from 'electron-ipc-decorator'
import type { YtDlpKernelStatus } from '../../shared/types'
import { DesktopApp } from '../App.service'
import { ffmpegManager } from '../lib/ffmpeg-manager'
import { getYtDlpKernelService } from '../lib/ytdlp-kernel-host'
import { ytdlpManager } from '../lib/ytdlp-manager'
import { NativeMessageBoxOptions } from '../NativeFoundation.model'
import { scopedLoggers } from '../utils/logger'
import {
  foundationHosts,
  foundationRuntime,
  runFoundation,
  runFoundationPromise
} from './foundation-runtime'
import { registerLegacy } from './registrar'

const nativeProcess: NodeJS.Process & { getSystemVersion?: () => string } = process
foundationHosts.app.install({
  version: () => app.getVersion(),
  platform: () => os.platform(),
  systemVersion: () =>
    typeof nativeProcess.getSystemVersion === 'function'
      ? nativeProcess.getSystemVersion()
      : typeof os.version === 'function'
        ? os.version()
        : os.release(),
  ffmpegReady: () => ffmpegManager.isReady(),
  ytdlpReady: () => ytdlpManager.isReady(),
  kernelStatus: () => getYtDlpKernelService().getStatus(),
  kernel: () => getYtDlpKernelService(),
  quit: () => app.quit(),
  messageBox: (options) => {
    const window = BrowserWindow.getFocusedWindow()
    return window
      ? Reflect.apply(dialog.showMessageBox, dialog, [window, options])
      : Reflect.apply(dialog.showMessageBox, dialog, [options])
  },
  fetch: (url) => fetch(url),
  base64: (bytes) => Buffer.from(bytes).toString('base64')
})
foundationHosts.logging.install((entry) => {
  scopedLoggers.system[entry.level](...entry.args)
})
const core = foundationRuntime.runSync(DesktopApp)
export class AppService {
  static readonly groupName = 'app'
  constructor() {
    registerLegacy('app.getVersion', this.getVersion.bind(this))
    registerLegacy('app.getPlatform', this.getPlatform.bind(this))
    registerLegacy('app.getDownloaderStatus', this.getDownloaderStatus.bind(this))
    registerLegacy('app.getYtDlpKernelStatus', this.getYtDlpKernelStatus.bind(this))
    registerLegacy('app.retryYtDlpKernelPreparation', this.retryYtDlpKernelPreparation.bind(this))
    registerLegacy('app.getOsVersion', this.getOsVersion.bind(this))
    registerLegacy('app.quit', this.quit.bind(this))
    registerLegacy('app.showMessageBox', this.showMessageBox.bind(this))
    registerLegacy('app.getSiteIcon', this.getSiteIcon.bind(this))
  }
  getVersion(_context: IpcContext): string {
    return runFoundation((call) => core.forCall(call).getVersion)
  }
  getPlatform(_context: IpcContext): string {
    return runFoundation((call) => core.forCall(call).getPlatform)
  }
  getDownloaderStatus(
    _context: IpcContext
  ): Promise<{ ytdlpReady: boolean; ffmpegReady: boolean }> {
    return runFoundationPromise((call) => core.forCall(call).getDownloaderStatus)
  }
  getYtDlpKernelStatus(_context: IpcContext): YtDlpKernelStatus {
    return runFoundation((call) => core.forCall(call).getYtDlpKernelStatus)
  }
  retryYtDlpKernelPreparation(_context: IpcContext): Promise<YtDlpKernelStatus> {
    return runFoundationPromise((call) => core.forCall(call).retryYtDlpKernelPreparation)
  }
  getOsVersion(_context: IpcContext): string {
    return runFoundation((call) => core.forCall(call).getOsVersion)
  }
  quit(_context: IpcContext): void {
    runFoundation((call) => core.forCall(call).quit)
  }
  // No JSON DTO decoder enters the compatibility channel.
  showMessageBox(
    _context: IpcContext,
    options: Electron.MessageBoxOptions
  ): Promise<Electron.MessageBoxReturnValue> {
    return runFoundationPromise((call) =>
      core.forCall(call).showMessageBox(NativeMessageBoxOptions.make(options))
    )
  }
  getSiteIcon(_context: IpcContext, domain: string): Promise<string | null> {
    return runFoundationPromise((call) => core.forCall(call).getSiteIcon(domain))
  }
}
