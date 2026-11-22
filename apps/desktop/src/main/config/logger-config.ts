import { initVidbeeLogger } from '@vidbee/logger/legacy'
import { app, ipcMain } from 'electron'
import { DesktopLogChannel } from '../../shared/logging/DesktopLog.model'
import { formatDesktopConsoleLog } from '../lib/desktop-console-format'
import { createDesktopLogging } from '../logging/DesktopLogging.entry'
import { electronLog as log, receiveDesktopLog } from '../logging/ElectronLog.driver'
import { otlpEnabled } from '../logging/Otlp.model'

/**
 * Configure electron-log
 * Set log format, file path, transport methods, etc.
 */
export function configureLogger() {
  initVidbeeLogger({ service: 'vidbee-desktop' })

  // Set log levels
  // Development: show all logs
  // Production: show info level and above only
  const isDev = process.env.NODE_ENV === 'development'
  log.transports.console.level = isDev ? 'silly' : 'info'
  log.transports.console.format = formatDesktopConsoleLog
  log.transports.file.level = isDev ? 'silly' : 'info'

  // Enable IPC transport in development environment to show renderer process logs in main process console
  if (isDev) {
    log.transports.ipc.level = 'silly'
  } else {
    log.transports.ipc.level = false
  }

  // Set maximum log file size (10MB)
  log.transports.file.maxSize = 10 * 1024 * 1024

  // Enable error catching - catch unhandled errors and rejected promises
  log.errorHandler.startCatching({
    showDialog: false, // Don't show error dialog, only log to file
    onError: (options) => {
      log.error('Unhandled error caught by electron-log:', options.error)
      log.error('App versions:', options.versions)
    }
  })

  log.info('Log file location:', log.transports.file.getFile().path)

  if (ipcMain !== undefined) {
    ipcMain.on(DesktopLogChannel, (_event, input: unknown) => receiveDesktopLog(input))
  }
  const enabled = otlpEnabled(process.env.VIDBEE_OTLP_ENABLED)
  const runtime = createDesktopLogging({
    enabled,
    endpoint: enabled
      ? (process.env.VIDBEE_OTLP_ENDPOINT ?? 'http://127.0.0.1:4318/v1/traces')
      : '',
    version: enabled ? app.getVersion() : ''
  })
  if (enabled) {
    app.once('will-quit', (event) => {
      event.preventDefault()
      void runtime.dispose().then(
        () => app.quit(),
        () => app.quit()
      )
    })
  }
}
