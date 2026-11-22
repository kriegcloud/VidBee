import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/AgentFailure.model')
/** Agent failure reason literals.
 * **Example** (Reject invalid AgentErrorCode input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentErrorCode } from './AgentFailure.model.js'
 * strictEqual(S.is(AgentErrorCode)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AgentErrorCode = LiteralKit([
  'TRANSPORT_LOST',
  'PROVIDER_UNAVAILABLE',
  'CONTEXT_OVERFLOW',
  'OUTPUT_TRUNCATED',
  'STREAM_INTERRUPTED',
  'RESUME_FAILED',
  'BILLING_REJECTED',
  'CONTENT_FILTERED',
  'PROVIDER_REJECTED',
  'CANCELLED',
  'STALLED',
  'PERSISTENCE_FAILED',
  'TIMEOUT',
  'INTERNAL'
]).pipe($I.annoteSchema('AgentErrorCode', { description: 'Agent failure reason.' }))
/** AgentErrorCode shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentErrorCode
 */
export type AgentErrorCode = typeof AgentErrorCode.Type

/** Shared provider failure; structural for legacy construction.
 * **Example** (Reject invalid AgentFailure input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentFailure } from './AgentFailure.model.js'
 * strictEqual(S.is(AgentFailure)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentFailure = S.Struct({
  code: AgentErrorCode.pipe(S.mutableKey),
  message: S.String.pipe(S.mutableKey),
  retryable: S.Boolean.pipe(S.mutableKey)
}).pipe($I.annoteSchema('AgentFailure', { description: 'Structured legacy failure.' }))
/** AgentFailure shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentFailure
 */
export type AgentFailure = typeof AgentFailure.Type

/** Typed strict operation failure. Legacy Error constructors remain in compatibility.
 * @example SharedOperationError.make({message:'Unavailable'})
 * @category errors
 * @since 0.0.0
 */
export class SharedOperationError extends S.TaggedError<
  SharedOperationError,
  { readonly brand: unique symbol }
>($I`SharedOperationError`)(
  'SharedOperationError',
  { message: S.String },
  $I.annoteError('SharedOperationError', {
    description: 'Typed failure for strict shared commands.'
  })
) {}
