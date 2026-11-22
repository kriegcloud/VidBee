import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'
import { strictObject } from './StrictObject'

const $I = $DesktopId.create('shared/agent-task')

import { MediaTransformInput } from './media-transform'

/** Validate executor-specific task options at both tool and host boundaries. */
/** AgentTaskInput; structural for legacy construction.
 * **Example** (Reject invalid AgentTaskInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentTaskInput } from './agent-task.js'
 * strictEqual(S.is(AgentTaskInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentTaskInput = S.Union([
  S.Struct({
    kind: LiteralKit(['video', 'audio']).pipe(S.optional, S.mutableKey),
    url: S.String.check(S.isMinLength(1)).check(S.isMaxLength(4096)).pipe(S.mutableKey),
    title: S.String.check(S.isMinLength(1))
      .check(S.isMaxLength(200))
      .pipe(S.optional, S.mutableKey),
    format: S.String.check(S.isMinLength(1))
      .check(S.isMaxLength(500))
      .pipe(S.optional, S.mutableKey),
    container: LiteralKit(['auto', 'mp4', 'mkv', 'webm', 'original']).pipe(S.optional, S.mutableKey)
  }).pipe(strictObject),
  S.Struct({
    ...MediaTransformInput.to.fields,
    ...{
      kind: S.Literal('conversion').pipe(S.mutableKey)
    }
  }).pipe(strictObject),
  S.Struct({
    kind: S.Literal('transcription').pipe(S.mutableKey),
    parentId: S.String.check(S.isMinLength(1)).check(S.isMaxLength(200)).pipe(S.mutableKey)
  }).pipe(strictObject),
  S.Struct({
    kind: S.Literal('model-download').pipe(S.mutableKey),
    asrTier: S.String.check(S.isMinLength(1)).check(S.isMaxLength(100)).pipe(S.mutableKey)
  }).pipe(strictObject)
]).pipe(
  $I.annoteSchema('AgentTaskInput', {
    description: 'AgentTaskInput shared boundary data.'
  })
)

/** Expose a flat object for providers that cannot generate root-union tool arguments. */
/** AgentTaskParameters; structural for legacy construction.
 * **Example** (Reject invalid AgentTaskParameters input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentTaskParameters } from './agent-task.js'
 * strictEqual(S.is(AgentTaskParameters)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentTaskParameters = S.Struct({
  ...MediaTransformInput.to.fields,
  ...AgentTaskInput.members[0].to.fields,
  background: S.Boolean.pipe(S.optional, S.mutableKey),
  kind: LiteralKit(['video', 'audio', 'conversion', 'transcription', 'model-download']).pipe(
    S.optional,
    S.mutableKey
  ),
  asrTier: S.String.check(S.isBetweenLength(1, 100)).pipe(S.optional, S.mutableKey)
})
  .mapFields((fields) => ({
    parentId: fields.parentId.pipe(S.optional),
    format: fields.format.pipe(S.optional),
    startSeconds: fields.startSeconds.pipe(S.optional),
    durationSeconds: fields.durationSeconds.pipe(S.optional),
    height: fields.height.pipe(S.optional),
    title: fields.title.pipe(S.optional),
    kind: fields.kind.pipe(S.optional),
    url: fields.url.pipe(S.optional),
    container: fields.container.pipe(S.optional),
    background: fields.background.pipe(S.optional),
    asrTier: fields.asrTier.pipe(S.optional)
  }))
  .pipe(
    strictObject,
    $I.annoteSchema('AgentTaskParameters', {
      description: 'AgentTaskParameters shared boundary data.'
    })
  )

/** Decoded AgentTaskInput data.
 * @category type-level
 * @since 0.0.0
 * @example AgentTaskInput
 */
export type AgentTaskInput = typeof AgentTaskInput.Type

/** Decoded AgentTaskParameters data.
 * @category type-level
 * @since 0.0.0
 * @example AgentTaskParameters
 */
export type AgentTaskParameters = typeof AgentTaskParameters.Type
