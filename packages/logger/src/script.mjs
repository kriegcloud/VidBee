import { initLogger, log as evlog } from 'evlog'

/**
 * Initialize evlog for VidBee Node scripts.
 */
function initScriptLogger() {
  initLogger({
    env: {
      service: process.env.VIDBEE_LOG_SERVICE ?? 'vidbee',
      environment: process.env.NODE_ENV ?? 'development'
    },
    pretty: true
  })
}

initScriptLogger()

/**
 * Convert an unknown log argument into a JSON-safe value.
 */
function serializeArg(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

/**
 * Emit a script log through evlog while keeping the console(message, ...args) API.
 */
function emit(level, args) {
  const [first, ...rest] = args
  if (typeof first === 'string' && rest.length === 0) {
    evlog[level]('vidbee', first)
    return
  }
  if (typeof first === 'string') {
    evlog[level]({
      event: first,
      details: rest.map(serializeArg)
    })
    return
  }
  if (first instanceof Error && rest.length === 0) {
    evlog[level](first)
    return
  }
  evlog[level]({
    event: 'vidbee',
    details: args.map(serializeArg)
  })
}

export const log = {
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
  debug: (...args) => emit('debug', args),
  log: (...args) => emit('info', args)
}
