import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'
import { AgentThread, AgentThreadSummary } from './agent-chat.js'

const $I = $DesktopId.create('shared/AgentPatch.model')

/** AgentPersistScope shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentPersistScope input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentPersistScope } from './AgentPatch.model.js'
 * strictEqual(S.is(AgentPersistScope)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentPersistScope = S.Struct({
  thread: S.Boolean.pipe(S.optional, S.mutableKey),
  messageIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  runIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  artifactIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentPersistScope', { description: 'AgentPersistScope shared boundary data.' })
)
/** Decoded mutable AgentPersistScope data.
 * @category type-level
 * @since 0.0.0
 * @example AgentPersistScope
 */
export type AgentPersistScope = typeof AgentPersistScope.Type

/** AgentRouteIdentity shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentRouteIdentity input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentRouteIdentity } from './AgentPatch.model.js'
 * strictEqual(S.is(AgentRouteIdentity)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentRouteIdentity = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  threadId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentRouteIdentity', { description: 'AgentRouteIdentity shared boundary data.' })
)
/** Decoded mutable AgentRouteIdentity data.
 * @category type-level
 * @since 0.0.0
 * @example AgentRouteIdentity
 */
export type AgentRouteIdentity = typeof AgentRouteIdentity.Type

/** AgentEventApplyResult shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentEventApplyResult input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentEventApplyResult } from './AgentPatch.model.js'
 * strictEqual(S.is(AgentEventApplyResult)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentEventApplyResult = S.Union([
  S.Struct({
    kind: S.Literal('ignored').pipe(S.mutableKey)
  }),
  S.Struct({
    kind: S.Literal('unchanged').pipe(S.mutableKey),
    thread: AgentThread.pipe(S.mutableKey)
  }),
  S.Struct({
    kind: S.Literal('applied').pipe(S.mutableKey),
    thread: AgentThread.pipe(S.mutableKey)
  }),
  S.Struct({
    kind: S.Literal('gap').pipe(S.mutableKey),
    thread: S.Union([AgentThread, S.Null]).pipe(S.mutableKey),
    observedSeq: S.Finite.pipe(S.mutableKey)
  })
]).pipe(
  $I.annoteSchema('AgentEventApplyResult', {
    description: 'AgentEventApplyResult shared boundary data.'
  })
)
/** Decoded mutable AgentEventApplyResult data.
 * @category type-level
 * @since 0.0.0
 * @example AgentEventApplyResult
 */
export type AgentEventApplyResult = typeof AgentEventApplyResult.Type

/** AgentGapRecovery shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentGapRecovery input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentGapRecovery } from './AgentPatch.model.js'
 * strictEqual(S.is(AgentGapRecovery)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentGapRecovery = S.Struct({
  inflight: S.Boolean.pipe(S.mutableKey),
  observedSeq: S.Finite.pipe(S.mutableKey),
  coveredSeq: S.Finite.pipe(S.mutableKey),
  followUpUsed: S.Boolean.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentGapRecovery', { description: 'AgentGapRecovery shared boundary data.' })
)
/** Decoded mutable AgentGapRecovery data.
 * @category type-level
 * @since 0.0.0
 * @example AgentGapRecovery
 */
export type AgentGapRecovery = typeof AgentGapRecovery.Type

/** CatalogMemoryEntry shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid CatalogMemoryEntry input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { CatalogMemoryEntry } from './AgentPatch.model.js'
 * strictEqual(S.is(CatalogMemoryEntry)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CatalogMemoryEntry = S.Struct({
  revision: S.Finite.pipe(S.mutableKey),
  removed: S.Boolean.pipe(S.mutableKey),
  history: S.Boolean.pipe(S.mutableKey),
  downloadId: S.String.pipe(S.mutableKey),
  summary: AgentThreadSummary.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('CatalogMemoryEntry', { description: 'CatalogMemoryEntry shared boundary data.' })
)
/** Decoded mutable CatalogMemoryEntry data.
 * @category type-level
 * @since 0.0.0
 * @example CatalogMemoryEntry
 */
export type CatalogMemoryEntry =
  typeof CatalogMemoryEntry.Type /** Ordered immutable catalog index; structural for legacy construction.
 * **Example** (Reject invalid CatalogMemory input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { CatalogMemory } from './AgentPatch.model.js'
 * strictEqual(S.is(CatalogMemory)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CatalogMemory = S.Struct({
  entries: S.HashMap(S.String, CatalogMemoryEntry).pipe(S.mutableKey),
  keys: S.Array(S.String).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('CatalogMemory', {
    description: 'Hash lookup plus explicit first-insertion key order.'
  })
)
/** CatalogMemory shared contract.
 * @category utilities
 * @since 0.0.0
 * @example CatalogMemory
 */
export type CatalogMemory = typeof CatalogMemory.Type
