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
 *
 * **Example** (Access the AGENT_PERMISSION_MODES contract)
 *
 * ```ts
 * import { AGENT_PERMISSION_MODES } from './agent-permissions.js'
 * void AGENT_PERMISSION_MODES
 * ```
 *
 */
export const AGENT_PERMISSION_MODES = AgentPermissionMode.literals

/** AgentPermissionMode shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the AgentPermissionMode contract)
 *
 * ```ts
 * import { AgentPermissionMode } from './agent-permissions.js'
 * void AgentPermissionMode
 * ```
 *
 */
export type AgentPermissionMode = typeof AgentPermissionMode.Type

/** DEFAULT_AGENT_PERMISSION_MODE shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the DEFAULT_AGENT_PERMISSION_MODE contract)
 *
 * ```ts
 * import { DEFAULT_AGENT_PERMISSION_MODE } from './agent-permissions.js'
 * void DEFAULT_AGENT_PERMISSION_MODE
 * ```
 *
 */
export const DEFAULT_AGENT_PERMISSION_MODE: AgentPermissionMode = 'auto'

/** Default missing settings to review while keeping legacy and invalid values manual.
 *
 * **Example** (Access the parseAgentPermissionMode contract)
 *
 * ```ts
 * import { parseAgentPermissionMode } from './agent-permissions.js'
 * void parseAgentPermissionMode
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function parseAgentPermissionMode(value: unknown): AgentPermissionMode {
  if (value === undefined) {
    return DEFAULT_AGENT_PERMISSION_MODE
  }
  return value === 'auto' || value === 'full' ? value : 'ask'
}
