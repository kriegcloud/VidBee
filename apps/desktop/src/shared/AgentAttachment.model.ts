import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/AgentAttachment.model')
/** Saved chat artifact; structural for legacy construction.
 * **Example** (Reject invalid AgentArtifact input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentArtifact } from './AgentAttachment.model.js'
 * strictEqual(S.is(AgentArtifact)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentArtifact = S.Struct({
  id: S.String.pipe(S.mutableKey),
  threadId: S.String.pipe(S.mutableKey),
  runId: S.String.pipe(S.mutableKey),
  sourceDownloadId: S.optional(S.String).pipe(S.mutableKey),
  kind: LiteralKit(['image', 'video']).pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  path: S.String.pipe(S.mutableKey),
  posterPath: S.optional(S.String).pipe(S.mutableKey),
  start: S.Finite.pipe(S.mutableKey),
  end: S.optional(S.Finite).pipe(S.mutableKey),
  width: S.optional(S.Finite).pipe(S.mutableKey),
  height: S.optional(S.Finite).pipe(S.mutableKey)
}).pipe($I.annoteSchema('AgentArtifact', { description: 'Saved media produced by a chat run.' }))
/** AgentArtifact shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentArtifact
 */
export type AgentArtifact = typeof AgentArtifact.Type
