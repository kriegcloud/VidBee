import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/skill-install')

/** MAX_SKILL_UPLOAD_BYTES shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the MAX_SKILL_UPLOAD_BYTES contract)
 *
 * ```ts
 * import { MAX_SKILL_UPLOAD_BYTES } from './skill-install.js'
 * void MAX_SKILL_UPLOAD_BYTES
 * ```
 *
 */
export const MAX_SKILL_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Runtime model for GitHubSkillSource shared values.
 *
 *
 * **Example** (Construct GitHubSkillSource)
 *
 * ```ts
 * import { GitHubSkillSource } from './skill-install.js'
 * const value = GitHubSkillSource.make({repository: "owner/project", revision: "main", paths: ["SKILL.md"]})
 * value.paths[0] // => "SKILL.md"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const GitHubSkillSource = S.Struct({
  repository: S.mutableKey(S.String),
  revision: S.mutableKey(S.String),
  paths: S.Array(S.String).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('GitHubSkillSource', { description: 'GitHubSkillSource shared boundary data.' })
)
/** Decoded GitHubSkillSource data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the GitHubSkillSource contract)
 *
 * ```ts
 * import { GitHubSkillSource } from './skill-install.js'
 * void GitHubSkillSource
 * ```
 *
 */
export type GitHubSkillSource = typeof GitHubSkillSource.Type

/**
 * Runtime model for GitHubSkillInstallInput shared values.
 *
 *
 * **Example** (Construct GitHubSkillInstallInput)
 *
 * ```ts
 * import { GitHubSkillInstallInput } from './skill-install.js'
 * const value = GitHubSkillInstallInput.make({repository: "owner/project", revision: "main", path: "SKILL.md"})
 * value.path // => "SKILL.md"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const GitHubSkillInstallInput = S.Struct({
  repository: S.mutableKey(S.String),
  revision: S.mutableKey(S.String),
  path: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('GitHubSkillInstallInput', {
    description: 'GitHubSkillInstallInput shared boundary data.'
  })
)
/** Decoded GitHubSkillInstallInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the GitHubSkillInstallInput contract)
 *
 * ```ts
 * import { GitHubSkillInstallInput } from './skill-install.js'
 * void GitHubSkillInstallInput
 * ```
 *
 */
export type GitHubSkillInstallInput = typeof GitHubSkillInstallInput.Type
