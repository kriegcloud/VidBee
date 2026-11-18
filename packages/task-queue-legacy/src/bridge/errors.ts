import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import * as SqlError from 'effect/sql/SqlError'
import { rethrowDriverError } from '@vidbee/db/legacy'
import { IllegalTransitionError } from '../fsm/index.js'
export const legacyError = (cause: Cause.Cause<unknown>): unknown => {
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure)) return Cause.squash(cause)
  const value = failure.value
  if (SqlError.isSqlError(value)) { try { rethrowDriverError(cause) } catch (error) { return error } }
  if (typeof value === 'object' && value !== null && '_tag' in value) {
    if (value._tag === 'HostFailure' && 'original' in value) return value.original
    if (value._tag === 'IllegalTransition' && 'from' in value && 'to' in value && 'reason' in value) {
      const from = value.from, to = value.to, reason = value.reason
      if (typeof from === 'string' && typeof to === 'string' && (reason === undefined || typeof reason === 'string')) return new IllegalTransitionError(from as import('../types.js').TaskStatus, to as import('../types.js').TaskStatus, reason)
    }
    if ('legacyMessage' in value && typeof value.legacyMessage === 'string') {
      if (value._tag === 'TaskRowDecodeError' && 'issue' in value && value.issue === 'Malformed JSON') return new SyntaxError(value.legacyMessage)
      return new Error(value.legacyMessage)
    }
  }
  return value
}
