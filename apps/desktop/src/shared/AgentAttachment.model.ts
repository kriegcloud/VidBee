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
  sourceDownloadId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  kind: LiteralKit(['image', 'video']).pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  path: S.String.pipe(S.mutableKey),
  posterPath: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  start: S.Finite.pipe(S.mutableKey),
  end: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  width: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  height: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe($I.annoteSchema('AgentArtifact', { description: 'Saved media produced by a chat run.' }))
/** AgentArtifact shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the AgentArtifact contract)
 *
 * ```ts
 * import { AgentArtifact } from './AgentAttachment.model.js'
 * void AgentArtifact
 * ```
 *
 */
export type AgentArtifact = typeof AgentArtifact.Type
