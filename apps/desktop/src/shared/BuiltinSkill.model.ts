import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/BuiltinSkill.model')
/** Authored skill metadata; structural for legacy construction.
 *
 * **Example** (Access the BuiltinSkillFrontmatter contract)
 *
 * ```ts
 * import { BuiltinSkillFrontmatter } from './BuiltinSkill.model.js'
 * void BuiltinSkillFrontmatter
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const BuiltinSkillFrontmatter = S.Struct({ name: S.String, description: S.String }).pipe(
  $I.annoteSchema('BuiltinSkillFrontmatter', { description: 'Repository skill frontmatter.' })
)
/** Authored skill and original document; structural for legacy construction.
 * **Example** (Reject invalid BuiltinSkill input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { BuiltinSkill } from './BuiltinSkill.model.js'
 * strictEqual(S.is(BuiltinSkill)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const BuiltinSkill = S.Struct({
  name: S.String.pipe(S.mutableKey),
  description: S.String.pipe(S.mutableKey),
  content: S.String.pipe(S.mutableKey),
  document: S.String.pipe(S.mutableKey)
}).pipe($I.annoteSchema('BuiltinSkill', { description: 'Eager repository skill.' }))
/** BuiltinSkill shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the BuiltinSkill contract)
 *
 * ```ts
 * import { BuiltinSkill } from './BuiltinSkill.model.js'
 * void BuiltinSkill
 * ```
 *
 */
export type BuiltinSkill = typeof BuiltinSkill.Type

/** Decoded BuiltinSkillFrontmatter data.
 * @category type-level
 * @since 0.0.0
 */
export type BuiltinSkillFrontmatter = typeof BuiltinSkillFrontmatter.Type
