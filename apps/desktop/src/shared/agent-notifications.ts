import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/agent-notifications')

/** AGENT_NOTIFICATION_OPEN_CHANNEL shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AGENT_NOTIFICATION_OPEN_CHANNEL
 */
export const AGENT_NOTIFICATION_OPEN_CHANNEL = 'ai:open-notification-thread'

/**
 * Runtime model for AgentNotificationTarget shared values.
 *
 *
 * **Example** (Construct AgentNotificationTarget)
 *
 * ```ts
 * import { AgentNotificationTarget } from './agent-notifications.js'
 * const value = AgentNotificationTarget.make({threadId: "thread", downloadId: "download", promptId: "overview"})
 * value.promptId // => "overview"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AgentNotificationTarget = S.Struct({
  threadId: S.mutableKey(S.String),
  downloadId: S.mutableKey(S.String),
  promptId: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('AgentNotificationTarget', {
    description: 'AgentNotificationTarget shared boundary data.'
  })
)
/** Decoded AgentNotificationTarget data.
 * @category type-level
 * @since 0.0.0
 * @example AgentNotificationTarget
 */
export type AgentNotificationTarget = typeof AgentNotificationTarget.Type
