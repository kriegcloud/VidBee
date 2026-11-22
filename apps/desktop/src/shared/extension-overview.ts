import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'
import { AiPromptErrorCode, AiPromptRunStatus } from './ai-types.js'

const $I = $DesktopId.create('shared/extension-overview')

/** Browser captions supplied to Desktop's existing Overview runner. */

/** Public result only; provider credentials stay in Desktop. */

/** A short-lived capability grants access to only the run started by this caller. */

/** ExtensionOverviewInput shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionOverviewInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionOverviewInput } from './extension-overview.js'
 * strictEqual(S.is(ExtensionOverviewInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionOverviewInput = S.Struct({
  requestId: S.String.pipe(S.mutableKey),
  sourceUrl: S.String.pipe(S.mutableKey),
  transcriptText: S.String.pipe(S.mutableKey),
  transcriptLanguage: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  transcriptOrigin: LiteralKit(['ai', 'human']).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  uiLanguage: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  forceRegenerate: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionOverviewInput', {
    description: 'ExtensionOverviewInput shared boundary data.'
  })
)
/** Decoded mutable ExtensionOverviewInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionOverviewInput contract)
 *
 * ```ts
 * import { ExtensionOverviewInput } from './extension-overview.js'
 * void ExtensionOverviewInput
 * ```
 *
 */
export type ExtensionOverviewInput = typeof ExtensionOverviewInput.Type

/** ExtensionOverviewSnapshot shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionOverviewSnapshot input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionOverviewSnapshot } from './extension-overview.js'
 * strictEqual(S.is(ExtensionOverviewSnapshot)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionOverviewSnapshot = S.Struct({
  status: AiPromptRunStatus.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey),
  error: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  errorCode: S.Union([AiPromptErrorCode, S.Null]).pipe(S.mutableKey),
  thinking: S.String.pipe(S.mutableKey),
  thinkingMs: S.Finite.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionOverviewSnapshot', {
    description: 'ExtensionOverviewSnapshot shared boundary data.'
  })
)
/** Decoded mutable ExtensionOverviewSnapshot data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionOverviewSnapshot contract)
 *
 * ```ts
 * import { ExtensionOverviewSnapshot } from './extension-overview.js'
 * void ExtensionOverviewSnapshot
 * ```
 *
 */
export type ExtensionOverviewSnapshot = typeof ExtensionOverviewSnapshot.Type

/** ExtensionOverviewJob shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionOverviewJob input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionOverviewJob } from './extension-overview.js'
 * strictEqual(S.is(ExtensionOverviewJob)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionOverviewJob = S.Struct({
  id: S.String.pipe(S.mutableKey),
  token: S.String.pipe(S.mutableKey),
  snapshot: ExtensionOverviewSnapshot.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionOverviewJob', {
    description: 'ExtensionOverviewJob shared boundary data.'
  })
)
/** Decoded mutable ExtensionOverviewJob data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionOverviewJob contract)
 *
 * ```ts
 * import { ExtensionOverviewJob } from './extension-overview.js'
 * void ExtensionOverviewJob
 * ```
 *
 */
export type ExtensionOverviewJob = typeof ExtensionOverviewJob.Type
