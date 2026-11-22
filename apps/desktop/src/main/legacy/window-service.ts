import { BrowserWindow } from 'electron'
import type { IpcContext } from 'electron-ipc-decorator'
import type { ShareCardPayload } from '../../compatibility/shared/types/share-card'
import { captureShareCardPng, writeShareImagePng } from '../lib/share-capture-window'
import { NativePngInput } from '../NativeFoundation.model'
import { DesktopWindow } from '../Window.service'
import {
  foundationHosts,
  foundationRuntime,
  runFoundation,
  runFoundationPromise
} from './foundation-runtime'
import { registerLegacy } from './registrar'

foundationHosts.window.install({
  focused: () => BrowserWindow.getFocusedWindow(),
  capture: captureShareCardPng,
  clipboard: (data) => {
    Reflect.apply(writeShareImagePng, undefined, [
      data instanceof Uint8Array ? Uint8Array.from(data).buffer : data
    ])
  }
})
const core = foundationRuntime.runSync(DesktopWindow)
export class WindowService {
  static readonly groupName = 'window'
  constructor() {
    registerLegacy('window.captureShareCard', this.captureShareCard.bind(this))
    registerLegacy('window.writeShareImage', this.writeShareImage.bind(this))
    registerLegacy('window.minimize', this.minimize.bind(this))
    registerLegacy('window.maximize', this.maximize.bind(this))
    registerLegacy('window.close', this.close.bind(this))
    registerLegacy('window.isMaximized', this.isMaximized.bind(this))
  }
  async captureShareCard(_context: IpcContext, payload: ShareCardPayload): Promise<ArrayBuffer> {
    const png = await runFoundationPromise((call) => core.forCall(call).captureShareCard(payload))
    return Uint8Array.from(png).buffer
  }
  writeShareImage(_context: IpcContext, data: ArrayBuffer): void {
    runFoundation((call) => core.forCall(call).writeShareImage(NativePngInput.make(data)))
  }
  minimize(_context: IpcContext): void {
    runFoundation((call) => core.forCall(call).minimize)
  }
  maximize(_context: IpcContext): void {
    runFoundation((call) => core.forCall(call).maximize)
  }
  close(_context: IpcContext): void {
    runFoundation((call) => core.forCall(call).close)
  }
  isMaximized(_context: IpcContext): boolean {
    return runFoundation((call) => core.forCall(call).isMaximized)
  }
}
