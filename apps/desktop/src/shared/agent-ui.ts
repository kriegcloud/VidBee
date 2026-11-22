import type {
  AgentProgressStep,
  AgentUiArtifact,
  AgentUiResponse,
  AgentUiRun,
  AgentUiSpec,
  AgentUiTaskFacts
} from '@vidbee/ui/lib/agent-ui'
import {
  AGENT_UI_FORMATS,
  agentUiCatalog,
  agentUiHasProgress,
  agentUiHasProgressSteps,
  agentUiNeedsResponse,
  agentUiResponseSchema,
  agentUiResponseText,
  agentUiSpecSchema,
  agentUiToolJsonSchema,
  updateAgentProgressSpec
} from '@vidbee/ui/lib/agent-ui'

export type {
  AgentProgressStep,
  AgentUiArtifact,
  AgentUiResponse,
  AgentUiRun,
  AgentUiSpec,
  AgentUiTaskFacts
}
/** Authoritative browser-safe UI implementation.
 * @category compatibility
 * @since 0.0.0
 */
export {
  AGENT_UI_FORMATS,
  agentUiCatalog,
  agentUiHasProgress,
  agentUiHasProgressSteps,
  agentUiNeedsResponse,
  agentUiResponseSchema,
  agentUiResponseText,
  agentUiSpecSchema,
  agentUiToolJsonSchema,
  updateAgentProgressSpec
}

import { $DesktopId } from '@vidbee/identity/packages'
import { TaskKind, TaskStatus } from '@vidbee/task-queue/Task.model'
import * as S from 'effect/Schema'
import * as Struct from 'effect/Struct'

const $I = $DesktopId.create('shared/agent-ui')

import { DownloadItem } from './types'

/** Native task projection used by Desktop's existing download cards. */
/** Desktop task projection; structural for legacy construction.
 * **Example** (Reject invalid AgentUiTask input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentUiTask } from './agent-ui.js'
 * strictEqual(S.is(AgentUiTask)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentUiTask = S.Struct({
  selectable: S.Boolean.pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  kind: TaskKind.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  status: TaskStatus.pipe(S.mutableKey),
  progress: S.NullOr(S.Finite).pipe(S.mutableKey),
  error: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  download: S.Struct(Struct.omit(DownloadItem.fields, ['ytDlpCommand', 'ytDlpLog', 'error'])).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe($I.annoteSchema('AgentUiTask', { description: 'Native download card projection.' }))
/** AgentUiTask shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the AgentUiTask contract)
 *
 * ```ts
 * import { AgentUiTask } from './agent-ui.js'
 * void AgentUiTask
 * ```
 *
 */
export type AgentUiTask = typeof AgentUiTask.Type
