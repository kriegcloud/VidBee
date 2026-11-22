import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'

const $I = $DesktopId.create('shared/agent-permissions')

/** Permission settings retain the missing-versus-invalid parser below.
 *
 * **Example** (Construct AgentPermissionMode)
 *
 * ```ts
 * import { AgentPermissionMode } from './agent-permissions.js'
 * const value = AgentPermissionMode.make("auto")
 * value // => "auto"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AgentPermissionMode = LiteralKit(['ask', 'auto', 'full']).pipe(
  $I.annoteSchema('AgentPermissionMode', { description: 'Agent management permission mode.' })
)
/** AGENT_PERMISSION_MODES shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AGENT_PERMISSION_MODES
 */
export const AGENT_PERMISSION_MODES = AgentPermissionMode.literals

/** AgentPermissionMode shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentPermissionMode
 */
export type AgentPermissionMode = typeof AgentPermissionMode.Type

/** DEFAULT_AGENT_PERMISSION_MODE shared contract.
 * @category utilities
 * @since 0.0.0
 * @example DEFAULT_AGENT_PERMISSION_MODE
 */
export const DEFAULT_AGENT_PERMISSION_MODE: AgentPermissionMode = 'auto'

/** Default missing settings to review while keeping legacy and invalid values manual.  * @example parseAgentPermissionMode
 * @category utilities
 * @since 0.0.0
 */
export function parseAgentPermissionMode(value: unknown): AgentPermissionMode {
  if (value === undefined) {
    return DEFAULT_AGENT_PERMISSION_MODE
  }
  return value === 'auto' || value === 'full' ? value : 'ask'
}
