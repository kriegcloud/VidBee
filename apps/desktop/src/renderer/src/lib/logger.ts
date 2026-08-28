/**
 * Renderer process logger backed by evlog.
 */
import { logger as evlogLogger } from '@vidbee/logger/client'

/** Renderer-facing evlog logger with the previous console-style API. */
export const logger = evlogLogger
export default evlogLogger
