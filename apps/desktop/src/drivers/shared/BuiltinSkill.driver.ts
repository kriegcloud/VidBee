import * as Effect from 'effect/Effect'
import * as O from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { parse } from 'yaml'
import { SharedOperationError } from '../../shared/AgentFailure.model'
import { type BuiltinSkill, BuiltinSkillFrontmatter } from '../../shared/BuiltinSkill.model'

/** Synchronous build-time YAML boundary, preserving YAML exceptions and the missing-header Error.
 * @example parseBuiltinSkill('---\nname: overview\ndescription: Summary\n---\nBody')
 * @category drivers
 * @since 0.0.0
 */
export function parseBuiltinSkill(document: string): BuiltinSkill {
  const match = O.getOrUndefined(Str.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)(document))
  if (match === undefined || match[1] === undefined || match[1].length === 0) {
    throw new Error('Built-in SKILL.md requires YAML frontmatter')
  }
  // D5: preserve the original eager API's permissive metadata construction. This is the
  // original assertion, retained at the legacy driver boundary rather than a strict guard.
  const metadata = parse(match[1]) as { name: string; description: string }
  return {
    name: metadata.name,
    description: metadata.description,
    content: Str.trim(Str.slice(match[0].length)(document)),
    document
  }
}

/** Strict YAML frontmatter admission for new callers. Legacy eager construction stays above.
 * @example decodeBuiltinSkillFrontmatter('name: overview\ndescription: Summary')
 * @category drivers
 * @since 0.0.0
 */
export const decodeBuiltinSkillFrontmatter = Effect.fn('shared.decodeBuiltinSkillFrontmatter')(
  (yaml: string) =>
    Effect.try({
      try: () => parse(yaml),
      catch: (error) =>
        SharedOperationError.make({
          message: error instanceof Error ? error.message : String(error)
        })
    }).pipe(Effect.flatMap(S.decodeUnknownEffect(BuiltinSkillFrontmatter)))
)
