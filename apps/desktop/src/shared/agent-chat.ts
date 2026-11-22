import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as A from 'effect/Array'
import { dual, pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as O from 'effect/Option'
import * as S from 'effect/Schema'
import { AgentArtifact } from './AgentAttachment.model.js'
import { AgentErrorCode } from './AgentFailure.model.js'
import { AgentActivity, AgentUiResponse, AgentUiSpec } from './AgentUi.model.js'
import { AgentMessage } from './RawMessage.model.js'

const $I = $DesktopId.create('shared/agent-chat')

import { AgentActivity as ReexportAgentActivity } from './AgentUi.model.js'

export { ReexportAgentActivity as AgentActivity }
/** AGENT_THINKING_LEVELS shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AGENT_THINKING_LEVELS
 */
export const AGENT_THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
] as const

/** Effort levels a custom provider can advertise. Off is controlled separately.  * @example PROVIDER_THINKING_EFFORT_LEVELS
 * @category utilities
 * @since 0.0.0
 */
export const PROVIDER_THINKING_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

// Leave room for the text part in Cloud's multimodal message envelope.
/** AGENT_MAX_MESSAGE_IMAGES shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AGENT_MAX_MESSAGE_IMAGES
 */
export const AGENT_MAX_MESSAGE_IMAGES = 10

/** Reserved conversation scope for chats without an attached library video.  * @example AGENT_WORKSPACE_ID
 * @category utilities
 * @since 0.0.0
 */
export const AGENT_WORKSPACE_ID = 'agent-workspace'

/** Image bytes supplied by the renderer for the shared attachment importer. */

/** A user-selected image copied into its conversation's local media directory. */

/** Durable product types shared by the renderer and desktop runtime. */
import { AgentArtifact as ReexportAgentArtifact } from './AgentAttachment.model.js'

export { ReexportAgentArtifact as AgentArtifact }
/** Compact conversation row for the transcript history drawer. */

/**
 * Entities changed by one streaming commit.
 * `downloadId` and `promptId` route the patch before the renderer has a thread.
 */

/**
 * Directory change that is ordered by `revision`, not by the thread seq.
 * Upserts that do not write a new seq still carry a newer revision.
 */

/** Keep selected images in the draft until a user message durably references them.  * @example draftAgentImages
 * @category utilities
 * @since 0.0.0
 */
export function draftAgentImages(thread: AgentThread): AgentImageAttachment[] {
  const sent = HashSet.fromIterable(
    pipe(
      thread.messages,
      A.filter((_message, index) => index in thread.messages),
      A.flatMap((message) => message.imageIds ?? [])
    )
  )
  const images = thread.images ?? []
  return A.filter(images, (image, index) => index in images && !HashSet.has(sent, image.id))
}
/**
 * Wall-clock duration of an agent reply.
 *
 * Tool calls, compaction and other events all count; the clock only stops when
 * the run settles with a final result.
 * @example agentThinkingElapsedMs
 * @category utilities
 * @since 0.0.0
 */
export const agentThinkingElapsedMs: {
  (now: number): (startedAt: number) => number
  (startedAt: number, now: number): number
} = dual(2, (startedAt: number, now: number): number => Math.max(0, now - startedAt))

/** Walk only the selected branch, rejecting corrupt cycles.  * @example selectedAgentMessages
 * @category utilities
 * @since 0.0.0
 */
export function selectedAgentMessages(thread: AgentThread): AgentChatMessage[] {
  const map = HashMap.fromIterable(
    A.map(thread.messages, (message): readonly [string, AgentChatMessage] => [message.id, message])
  )
  const messages: AgentChatMessage[] = []
  let seen = HashSet.empty<string>()
  let id = thread.leafId
  while (id !== null && id.length > 0 && !HashSet.has(seen, id)) {
    seen = HashSet.add(seen, id)
    const message = pipe(map, HashMap.get(id), O.getOrUndefined)
    if (message === undefined) {
      break
    }
    messages.unshift(message)
    id = message.parentId
  }
  return messages
}

/** AgentThinkingLevel shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentThinkingLevel input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentThinkingLevel } from './agent-chat.js'
 * strictEqual(S.is(AgentThinkingLevel)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentThinkingLevel = LiteralKit([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]).pipe(
  $I.annoteSchema('AgentThinkingLevel', {
    description: 'AgentThinkingLevel shared boundary data.'
  })
)
/** Decoded mutable AgentThinkingLevel data.
 * @category type-level
 * @since 0.0.0
 * @example AgentThinkingLevel
 */
export type AgentThinkingLevel = typeof AgentThinkingLevel.Type

/** ProviderThinkingEffortLevel shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ProviderThinkingEffortLevel input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ProviderThinkingEffortLevel } from './agent-chat.js'
 * strictEqual(S.is(ProviderThinkingEffortLevel)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ProviderThinkingEffortLevel = LiteralKit([
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]).pipe(
  $I.annoteSchema('ProviderThinkingEffortLevel', {
    description: 'ProviderThinkingEffortLevel shared boundary data.'
  })
)
/** Decoded mutable ProviderThinkingEffortLevel data.
 * @category type-level
 * @since 0.0.0
 * @example ProviderThinkingEffortLevel
 */
export type ProviderThinkingEffortLevel = typeof ProviderThinkingEffortLevel.Type

/** ProviderDefaultThinkingLevel shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ProviderDefaultThinkingLevel input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ProviderDefaultThinkingLevel } from './agent-chat.js'
 * strictEqual(S.is(ProviderDefaultThinkingLevel)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ProviderDefaultThinkingLevel = S.Union([S.Literal('auto'), AgentThinkingLevel]).pipe(
  $I.annoteSchema('ProviderDefaultThinkingLevel', {
    description: 'ProviderDefaultThinkingLevel shared boundary data.'
  })
)
/** Decoded mutable ProviderDefaultThinkingLevel data.
 * @category type-level
 * @since 0.0.0
 * @example ProviderDefaultThinkingLevel
 */
export type ProviderDefaultThinkingLevel = typeof ProviderDefaultThinkingLevel.Type

/** AgentThinkingOptions shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentThinkingOptions input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentThinkingOptions } from './agent-chat.js'
 * strictEqual(S.is(AgentThinkingOptions)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentThinkingOptions = S.Struct({
  levels: S.Array(AgentThinkingLevel).pipe(S.mutable, S.mutableKey),
  defaultLevel: AgentThinkingLevel.pipe(S.mutableKey),
  vision: S.Boolean.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentThinkingOptions', {
    description: 'AgentThinkingOptions shared boundary data.'
  })
)
/** Decoded mutable AgentThinkingOptions data.
 * @category type-level
 * @since 0.0.0
 * @example AgentThinkingOptions
 */
export type AgentThinkingOptions = typeof AgentThinkingOptions.Type

/** AgentImageUpload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentImageUpload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentImageUpload } from './agent-chat.js'
 * strictEqual(S.is(AgentImageUpload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentImageUpload = S.Struct({
  name: S.String.pipe(S.mutableKey),
  data: S.Uint8Array.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentImageUpload', {
    description: 'AgentImageUpload shared boundary data.'
  })
)
/** Decoded mutable AgentImageUpload data.
 * @category type-level
 * @since 0.0.0
 * @example AgentImageUpload
 */
export type AgentImageUpload = typeof AgentImageUpload.Type

/** AgentImageAttachment shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentImageAttachment input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentImageAttachment } from './agent-chat.js'
 * strictEqual(S.is(AgentImageAttachment)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentImageAttachment = S.Struct({
  id: S.String.pipe(S.mutableKey),
  threadId: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  path: S.String.pipe(S.mutableKey),
  mimeType: LiteralKit(['image/png', 'image/jpeg']).pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  width: S.Finite.pipe(S.mutableKey),
  height: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentImageAttachment', {
    description: 'AgentImageAttachment shared boundary data.'
  })
)
/** Decoded mutable AgentImageAttachment data.
 * @category type-level
 * @since 0.0.0
 * @example AgentImageAttachment
 */
export type AgentImageAttachment = typeof AgentImageAttachment.Type

/** AgentRunStatus shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentRunStatus input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentRunStatus } from './agent-chat.js'
 * strictEqual(S.is(AgentRunStatus)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentRunStatus = LiteralKit([
  'running',
  'completed',
  'aborted',
  'error',
  'interrupted'
]).pipe(
  $I.annoteSchema('AgentRunStatus', {
    description: 'AgentRunStatus shared boundary data.'
  })
)
/** Decoded mutable AgentRunStatus data.
 * @category type-level
 * @since 0.0.0
 * @example AgentRunStatus
 */
export type AgentRunStatus = typeof AgentRunStatus.Type

/** AgentToolCallStatus shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentToolCallStatus input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentToolCallStatus } from './agent-chat.js'
 * strictEqual(S.is(AgentToolCallStatus)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentToolCallStatus = LiteralKit([
  'running',
  'completed',
  'error',
  'pending-approval',
  'denied'
]).pipe(
  $I.annoteSchema('AgentToolCallStatus', {
    description: 'AgentToolCallStatus shared boundary data.'
  })
)
/** Decoded mutable AgentToolCallStatus data.
 * @category type-level
 * @since 0.0.0
 * @example AgentToolCallStatus
 */
export type AgentToolCallStatus = typeof AgentToolCallStatus.Type

/** AgentApprovalAction shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentApprovalAction input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentApprovalAction } from './agent-chat.js'
 * strictEqual(S.is(AgentApprovalAction)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentApprovalAction = LiteralKit([
  'task.create',
  'task.cancel',
  'task.remove',
  'task.rename',
  'task.rename_file',
  'subscription.add',
  'subscription.update',
  'subscription.remove',
  'settings.proxy',
  'settings.config_path',
  'settings.download_path',
  'settings.update',
  'ai.delete_provider',
  'ai.delete_prompt',
  'asr.delete',
  'ytdlp.update',
  'shell.execute',
  'tool.execute'
]).pipe(
  $I.annoteSchema('AgentApprovalAction', {
    description: 'AgentApprovalAction shared boundary data.'
  })
)
/** Decoded mutable AgentApprovalAction data.
 * @category type-level
 * @since 0.0.0
 * @example AgentApprovalAction
 */
export type AgentApprovalAction = typeof AgentApprovalAction.Type

/** AgentApprovalRequest shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentApprovalRequest input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentApprovalRequest } from './agent-chat.js'
 * strictEqual(S.is(AgentApprovalRequest)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentApprovalRequest = S.Struct({
  grantKey: S.String.pipe(S.optional, S.mutableKey),
  action: AgentApprovalAction.pipe(S.mutableKey),
  summary: S.String.pipe(S.mutableKey),
  risk: LiteralKit(['destructive', 'config', 'network']).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentApprovalRequest', {
    description: 'AgentApprovalRequest shared boundary data.'
  })
)
/** Decoded mutable AgentApprovalRequest data.
 * @category type-level
 * @since 0.0.0
 * @example AgentApprovalRequest
 */
export type AgentApprovalRequest = typeof AgentApprovalRequest.Type

/** AgentChatMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentChatMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentChatMessage } from './agent-chat.js'
 * strictEqual(S.is(AgentChatMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentChatMessage = S.Struct({
  id: S.String.pipe(S.mutableKey),
  parentId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  runId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  role: LiteralKit(['user', 'assistant']).pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey),
  uiResponse: AgentUiResponse.pipe(S.optional, S.mutableKey),
  imageIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  thinking: S.String.pipe(S.mutableKey),
  thinkingMs: S.Finite.pipe(S.optional, S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  legacy: S.Boolean.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentChatMessage', {
    description: 'AgentChatMessage shared boundary data.'
  })
)
/** Decoded mutable AgentChatMessage data.
 * @category type-level
 * @since 0.0.0
 * @example AgentChatMessage
 */
export type AgentChatMessage = typeof AgentChatMessage.Type

/** AgentContextCheckpoint shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentContextCheckpoint input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentContextCheckpoint } from './agent-chat.js'
 * strictEqual(S.is(AgentContextCheckpoint)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentContextCheckpoint = S.Struct({
  coveredCount: S.Finite.pipe(S.mutableKey),
  digest: S.String.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentContextCheckpoint', {
    description: 'AgentContextCheckpoint shared boundary data.'
  })
)
/** Decoded mutable AgentContextCheckpoint data.
 * @category type-level
 * @since 0.0.0
 * @example AgentContextCheckpoint
 */
export type AgentContextCheckpoint = typeof AgentContextCheckpoint.Type

/** AgentChatRun shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentChatRun input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentChatRun } from './agent-chat.js'
 * strictEqual(S.is(AgentChatRun)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentChatRun = S.Struct({
  id: S.String.pipe(S.mutableKey),
  messageId: S.String.pipe(S.mutableKey),
  status: AgentRunStatus.pipe(S.mutableKey),
  error: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  errorCode: AgentErrorCode.pipe(S.optional, S.mutableKey),
  model: S.String.pipe(S.mutableKey),
  instruction: S.String.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey),
  rawMessages: S.Array(AgentMessage).pipe(S.mutable, S.mutableKey),
  sessionEntries: S.Array(S.Unknown).pipe(S.mutable, S.optional, S.mutableKey),
  evidenceCoverage: S.Record(
    S.String,
    S.Array(S.Tuple([S.Finite, S.Finite]).pipe(S.mutable)).pipe(S.mutable, S.mutableKey)
  ).pipe(S.optional, S.mutableKey),
  evidenceSource: S.String.pipe(S.optional, S.mutableKey),
  sourceDownloadId: S.String.pipe(S.optional, S.mutableKey),
  taskIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  fullSourceReview: S.Boolean.pipe(S.optional, S.mutableKey),
  preloadedSourceLines: S.Finite.pipe(S.optional, S.mutableKey),
  articleSections: S.Array(S.Unknown).pipe(S.mutable, S.optional, S.mutableKey),
  articleReview: S.Struct({
    status: LiteralKit(['passed', 'issues', 'unavailable']).pipe(S.optional, S.mutableKey),
    checkedSections: S.Finite.pipe(S.mutableKey),
    issues: S.Finite.pipe(S.mutableKey),
    passed: S.Boolean.pipe(S.mutableKey)
  }).pipe(S.optional, S.mutableKey),
  activity: S.Array(AgentActivity).pipe(S.mutable, S.optional, S.mutableKey),
  lifecycle: S.Array(
    S.Struct({
      id: S.String.pipe(S.mutableKey),
      messageCount: S.Finite.pipe(S.mutableKey),
      status: LiteralKit(['retrying', 'compacting', 'recovering']).pipe(S.mutableKey)
    })
  ).pipe(S.mutable, S.optional, S.mutableKey),
  tools: S.Array(
    S.Struct({
      id: S.String.pipe(S.mutableKey),
      name: S.String.pipe(S.mutableKey),
      status: AgentToolCallStatus.pipe(S.mutableKey),
      detail: S.String.pipe(S.optional, S.mutableKey),
      taskId: S.String.pipe(S.optional, S.mutableKey),
      approval: AgentApprovalRequest.pipe(S.optional, S.mutableKey),
      ui: AgentUiSpec.pipe(S.optional, S.mutableKey),
      skills: S.Array(
        S.Struct({
          name: S.String.pipe(S.mutableKey),
          description: S.String.pipe(S.mutableKey),
          resource: S.String.pipe(S.mutableKey)
        })
      ).pipe(S.mutable, S.optional, S.mutableKey)
    })
  ).pipe(S.mutable, S.mutableKey),
  usage: S.Struct({
    input: S.Finite.pipe(S.mutableKey),
    output: S.Finite.pipe(S.mutableKey),
    totalTokens: S.Finite.pipe(S.mutableKey),
    cacheRead: S.Finite.pipe(S.optional, S.mutableKey),
    cacheWrite: S.Finite.pipe(S.optional, S.mutableKey),
    reasoning: S.Finite.pipe(S.optional, S.mutableKey)
  }).pipe(S.optional, S.mutableKey),
  sourceOffset: S.Finite.pipe(S.optional, S.mutableKey),
  contextSummary: S.Struct({
    digest: S.String.pipe(S.mutableKey),
    text: S.String.pipe(S.mutableKey)
  }).pipe(S.optional, S.mutableKey),
  contextCheckpoint: AgentContextCheckpoint.pipe(S.optional, S.mutableKey),
  workingNotes: S.String.pipe(S.optional, S.mutableKey),
  contextStatus: LiteralKit(['compacting', 'recovering', 'reviewing', 'writing']).pipe(
    S.optional,
    S.mutableKey
  ),
  cloudResultId: S.String.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentChatRun', {
    description: 'AgentChatRun shared boundary data.'
  })
)
/** Decoded mutable AgentChatRun data.
 * @category type-level
 * @since 0.0.0
 * @example AgentChatRun
 */
export type AgentChatRun = typeof AgentChatRun.Type

/** AgentThread shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentThread input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentThread } from './agent-chat.js'
 * strictEqual(S.is(AgentThread)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentThread = S.Struct({
  id: S.String.pipe(S.mutableKey),
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  leafId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  seq: S.Finite.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  thinkingLevel: AgentThinkingLevel.pipe(S.optional, S.mutableKey),
  messages: S.Array(AgentChatMessage).pipe(S.mutable, S.mutableKey),
  runs: S.Array(AgentChatRun).pipe(S.mutable, S.mutableKey),
  artifacts: S.Array(AgentArtifact).pipe(S.mutable, S.mutableKey),
  images: S.Array(AgentImageAttachment).pipe(S.mutable, S.optional, S.mutableKey),
  toolGrants: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentThread', {
    description: 'AgentThread shared boundary data.'
  })
)
/** Decoded mutable AgentThread data.
 * @category type-level
 * @since 0.0.0
 * @example AgentThread
 */
export type AgentThread = typeof AgentThread.Type

/** AgentThreadSummary shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentThreadSummary input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentThreadSummary } from './agent-chat.js'
 * strictEqual(S.is(AgentThreadSummary)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentThreadSummary = S.Struct({
  id: S.String.pipe(S.mutableKey),
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey),
  running: S.Boolean.pipe(S.mutableKey),
  approvalPending: S.Boolean.pipe(S.optional, S.mutableKey),
  status: S.Union([AgentRunStatus, S.Literal('idle')]).pipe(S.optional, S.mutableKey),
  model: S.String.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentThreadSummary', {
    description: 'AgentThreadSummary shared boundary data.'
  })
)
/** Decoded mutable AgentThreadSummary data.
 * @category type-level
 * @since 0.0.0
 * @example AgentThreadSummary
 */
export type AgentThreadSummary = typeof AgentThreadSummary.Type

/** AgentThreadPatch shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentThreadPatch input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentThreadPatch } from './agent-chat.js'
 * strictEqual(S.is(AgentThreadPatch)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentThreadPatch = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  threadId: S.String.pipe(S.mutableKey),
  leafId: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  toolGrants: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  images: S.Array(AgentImageAttachment).pipe(S.mutable, S.optional, S.mutableKey),
  messages: S.Array(AgentChatMessage).pipe(S.mutable, S.optional, S.mutableKey),
  runs: S.Array(AgentChatRun).pipe(S.mutable, S.optional, S.mutableKey),
  artifacts: S.Array(AgentArtifact).pipe(S.mutable, S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentThreadPatch', {
    description: 'AgentThreadPatch shared boundary data.'
  })
)
/** Decoded mutable AgentThreadPatch data.
 * @category type-level
 * @since 0.0.0
 * @example AgentThreadPatch
 */
export type AgentThreadPatch = typeof AgentThreadPatch.Type

/** AgentCatalogNotice shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentCatalogNotice input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentCatalogNotice } from './agent-chat.js'
 * strictEqual(S.is(AgentCatalogNotice)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentCatalogNotice = S.Union([
  S.Struct({
    kind: S.Literal('upsert').pipe(S.mutableKey),
    summary: AgentThreadSummary.pipe(S.mutableKey),
    history: S.Boolean.pipe(S.mutableKey),
    runStatus: S.Union([AgentRunStatus, S.Literal('idle')]).pipe(S.mutableKey),
    statusUpdatedAt: S.Finite.pipe(S.mutableKey),
    revision: S.Finite.pipe(S.mutableKey)
  }),
  S.Struct({
    kind: S.Literal('remove').pipe(S.mutableKey),
    id: S.String.pipe(S.mutableKey),
    downloadId: S.String.pipe(S.mutableKey),
    revision: S.Finite.pipe(S.mutableKey)
  })
]).pipe(
  $I.annoteSchema('AgentCatalogNotice', {
    description: 'AgentCatalogNotice shared boundary data.'
  })
)
/** Decoded mutable AgentCatalogNotice data.
 * @category type-level
 * @since 0.0.0
 * @example AgentCatalogNotice
 */
export type AgentCatalogNotice = typeof AgentCatalogNotice.Type

/** AgentRunEvent shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentRunEvent input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentRunEvent } from './agent-chat.js'
 * strictEqual(S.is(AgentRunEvent)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentRunEvent = S.Struct({
  threadId: S.String.pipe(S.mutableKey),
  runId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  messageId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  seq: S.Finite.pipe(S.mutableKey),
  type: S.String.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  snapshot: AgentThread.pipe(S.optional, S.mutableKey),
  patch: AgentThreadPatch.pipe(S.optional, S.mutableKey),
  catalog: AgentCatalogNotice.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentRunEvent', {
    description: 'AgentRunEvent shared boundary data.'
  })
)
/** Decoded mutable AgentRunEvent data.
 * @category type-level
 * @since 0.0.0
 * @example AgentRunEvent
 */
export type AgentRunEvent = typeof AgentRunEvent.Type

/** AgentChatInput shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentChatInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentChatInput } from './agent-chat.js'
 * strictEqual(S.is(AgentChatInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentChatInput = S.Struct({
  uiResponse: AgentUiResponse.pipe(S.optional, S.mutableKey),
  thinkingLevel: AgentThinkingLevel.pipe(S.optional, S.mutableKey),
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  threadId: S.String.pipe(S.optional, S.mutableKey),
  transcriptText: S.String.pipe(S.optional, S.mutableKey),
  text: S.String.pipe(S.optional, S.mutableKey),
  imageIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  retryMessageId: S.String.pipe(S.optional, S.mutableKey),
  uiLanguage: S.String.pipe(S.optional, S.mutableKey),
  sourceTitle: S.String.pipe(S.optional, S.mutableKey),
  sourceDurationMs: S.Finite.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentChatInput', {
    description: 'AgentChatInput shared boundary data.'
  })
)
/** Decoded mutable AgentChatInput data.
 * @category type-level
 * @since 0.0.0
 * @example AgentChatInput
 */
export type AgentChatInput = typeof AgentChatInput.Type
