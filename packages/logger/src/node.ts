import { createLogger, createRequestLogger, initLogger, log } from 'evlog'

export interface VidbeeLoggerOptions {
  service: string
  pretty?: boolean
}

/**
 * Initialize the process-wide evlog instance for a VidBee Node process.
 */
export function initVidbeeLogger(options: VidbeeLoggerOptions): void {
  const environment = process.env.NODE_ENV ?? 'development'
  initLogger({
    env: {
      service: options.service,
      environment
    },
    pretty: options.pretty ?? environment !== 'production'
  })
}

/**
 * Log a caught error as a structured evlog event.
 */
export function logCaughtError(event: string, error: unknown): void {
  log.error({
    event,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  })
}

export { createLogger, createRequestLogger, log }
