import * as A from 'effect/Array'
import * as R from 'effect/Record'
import { parseBuiltinSkill } from '../drivers/shared/BuiltinSkill.driver'

/** Eager repository skills; raw glob order and this filename remain the build-time contract.
 * @example BUILTIN_SKILLS[0]?.name
 * @category constants
 * @since 0.0.0
 */
export const BUILTIN_SKILLS = A.map(
  R.values(
    import.meta.glob<string>('../../../../skills/*/SKILL.md', {
      eager: true,
      query: '?raw',
      import: 'default'
    })
  ),
  parseBuiltinSkill
)
