import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/AgentUi.model')
/** Shared UI element projection; structural for legacy construction. Library validation remains in its existing boundary.
 * @category schemas
 * @since 0.0.0
 * @example AgentUiElement
 */
export const AgentUiElement = S.Struct({
  type: LiteralKit([
    'Stack',
    'AgentProgress',
    'TaskCard',
    'TaskPicker',
    'ChoiceCard',
    'MediaSettings',
    'InfoCard'
  ]).pipe(S.mutableKey),
  props: S.Record(S.String, S.Unknown.pipe(S.mutableKey)).pipe(S.mutableKey),
  children: S.Array(S.String).pipe(S.mutable, S.mutableKey)
}).pipe($I.annoteSchema('AgentUiElement', { description: 'Browser-safe presentation element.' }))
/** Saved UI projection; structural for legacy construction.
 * **Example** (Reject invalid AgentUiSpec input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentUiSpec } from './AgentUi.model.js'
 * strictEqual(S.is(AgentUiSpec)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentUiSpec = S.Struct({
  root: S.String.pipe(S.mutableKey),
  elements: S.Record(S.String, AgentUiElement.pipe(S.mutableKey)).pipe(S.mutableKey)
}).pipe($I.annoteSchema('AgentUiSpec', { description: 'Saved generated UI projection.' }))
/** AgentUiSpec shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentUiSpec
 */
export type AgentUiSpec = typeof AgentUiSpec.Type
/** Confirmed UI answer; structural for legacy construction.
 * **Example** (Reject invalid AgentUiResponse input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentUiResponse } from './AgentUi.model.js'
 * strictEqual(S.is(AgentUiResponse)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentUiResponse = S.Struct({
  toolCallId: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  values: S.Array(S.String).pipe(S.mutable, S.mutableKey)
}).pipe($I.annoteSchema('AgentUiResponse', { description: 'Confirmed UI response.' }))
/** AgentUiResponse shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentUiResponse
 */
export type AgentUiResponse = typeof AgentUiResponse.Type
/** Ordered chat activity; structural for legacy construction.
 * **Example** (Reject invalid AgentActivity input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentActivity } from './AgentUi.model.js'
 * strictEqual(S.is(AgentActivity)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentActivity = S.Union([
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    kind: LiteralKit(['thinking', 'commentary']).pipe(S.mutableKey),
    text: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    kind: S.Literal('status').pipe(S.mutableKey),
    status: LiteralKit(['retrying', 'compacting', 'recovering']).pipe(S.mutableKey)
  }),
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    kind: S.Literal('tool').pipe(S.mutableKey),
    toolId: S.String.pipe(S.mutableKey),
    name: S.String.pipe(S.mutableKey),
    count: S.Finite.pipe(S.optional, S.mutableKey),
    artifactIds: S.Array(S.String).pipe(S.mutable, S.mutableKey)
  })
]).pipe($I.annoteSchema('AgentActivity', { description: 'Ordered model and tool activity.' }))
/** AgentActivity shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentActivity
 */
export type AgentActivity = typeof AgentActivity.Type
