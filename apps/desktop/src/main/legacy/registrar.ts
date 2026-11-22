import { ipcMain } from 'electron'
import type { IpcContext } from 'electron-ipc-decorator'

/** Keep the installed decorator's exact async wrapper and console prefix. */
export const registerLegacy = <A extends unknown[], R>(
  channel: string,
  handler: (context: IpcContext, ...args: A) => R
): void => {
  ipcMain.handle(channel, async (event, ...args: A) => {
    const context = { sender: event.sender, event }
    try {
      return await handler(context, ...args)
    } catch (error) {
      console.error(`Error in IPC method ${channel}:`, error)
      throw error
    }
  })
}
