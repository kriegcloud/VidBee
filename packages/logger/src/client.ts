import { initLog, log } from 'evlog/client'

const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)

initLog({
  service: 'vidbee',
  pretty: isDev,
  console: true
})

/**
 * Convert an unknown log argument into a JSON-safe value.
 */
function serializeArg(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

/**
 * Emit a client log through evlog while keeping the console(message, ...args) API.
 */
function emit(level: 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void {
  const [first, ...rest] = args
  if (typeof first === 'string' && rest.length === 0) {
    log[level]('vidbee', first)
    return
  }
  if (typeof first === 'string') {
    log[level]({
      event: first,
      details: rest.map(serializeArg)
    })
    return
  }
  if (first instanceof Error && rest.length === 0) {
    if (level === 'error') {
      log.error(first)
      return
    }
    log[level]({
      event: first.message,
      name: first.name,
      stack: first.stack
    })
    return
  }
  log[level]({
    event: 'vidbee',
    details: args.map(serializeArg)
  })
}

export const logger = {
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
  debug: (...args: unknown[]) => emit('debug', args)
}

export { log }
