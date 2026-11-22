import { $DesktopId } from '@vidbee/identity/packages'
import { TaskKind } from '@vidbee/task-queue/Task.model'
import { isDownloadTaskKind } from '@vidbee/task-queue/types'
import * as A from 'effect/Array'
import { pipe } from 'effect/Function'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { AI_OVERVIEW_PROMPT_ID } from './AiPromptIds.js'
import { type AgentThread, selectedAgentMessages } from './agent-chat.js'
import { AiPromptRunSnapshot, type AiPromptRunStatus } from './ai-types.js'
import { recordFunction } from './RecordFunction.js'
import { videoIdentityFromUrl } from './video-identity.js'

const $I = $DesktopId.create('shared/extension-overview-reuse')

/** Download-shaped row used to match an extension watch URL to Desktop history. */

/** Attach an existing Desktop Overview, start on that download, or use an ephemeral job. */

/**
 * True when an existing Overview is worth showing instead of starting another run.
 *
 * @param snapshot Live agent or prompt-run result for one download.
 * @example isReusableOverviewSnapshot
 * @category utilities
 * @since 0.0.0
 */
export function isReusableOverviewSnapshot(snapshot: AiPromptRunSnapshot): boolean {
  if (snapshot.status === 'running') {
    return true
  }
  if (snapshot.status === 'idle') {
    return false
  }
  return P.isTruthy(Str.trim(snapshot.text))
}

/**
 * Project the selected Overview agent reply onto the extension snapshot contract.
 *
 * @param thread Persisted Desktop agent thread for this video.
 * @example snapshotFromOverviewThread
 * @category utilities
 * @since 0.0.0
 */
export function snapshotFromOverviewThread(thread: AgentThread): AiPromptRunSnapshot | null {
  const assistant = pipe(
    selectedAgentMessages(thread),
    A.reverse,
    A.findFirst((message) => message.role === 'assistant'),
    O.getOrUndefined
  )
  if (assistant === undefined) {
    return null
  }
  const run = pipe(
    thread.runs,
    A.findFirst((item) => item.id === assistant.runId),
    O.getOrUndefined
  )
  const status = overviewStatusFromAgent(run?.status, assistant.text)
  if (status === null) {
    return null
  }
  return {
    downloadId: thread.downloadId,
    promptId: thread.promptId || AI_OVERVIEW_PROMPT_ID,
    status,
    text: assistant.text,
    thinking: assistant.thinking,
    thinkingMs: assistant.thinkingMs ?? 0,
    error: run?.error ?? null,
    errorCode: P.isTruthy(run?.error) ? 'unknown' : null,
    updatedAt: run?.updatedAt ?? assistant.createdAt
  }
}

/**
 * Map an agent run onto the prompt-run statuses the extension already polls.
 *
 * @param runStatus Agent lifecycle for the selected assistant message.
 * @param text Visible Overview answer.
 */
function overviewStatusFromAgent(
  runStatus: AgentThread['runs'][number]['status'] | undefined,
  text: string
): AiPromptRunStatus | null {
  if (runStatus === 'running') {
    return 'running'
  }
  if (runStatus === 'aborted' || runStatus === 'interrupted') {
    return 'aborted'
  }
  if (runStatus === 'error') {
    return 'error'
  }
  return Str.trim(text).length > 0 ? 'completed' : null
}

/**
 * Pick the newest matching Desktop download, preferring one that already has Overview.
 *
 * @param sourceUrl Watch URL from the extension tab.
 * @param tasks Local download history rows.
 * @param hasReusableOverview True when that download already has a showable Overview.
 * @example OverviewSourceLookup
 * @category utilities
 * @since 0.0.0
 */
export interface OverviewSourceLookup {
  readonly sourceUrl: string
  readonly tasks: readonly OverviewDownloadMatch[]
  readonly hasReusableOverview: (downloadId: string) => boolean
}
/** findDownloadIdForSourceUrl shared contract.
 * @category utilities
 * @since 0.0.0
 * @example findDownloadIdForSourceUrl
 */
export const findDownloadIdForSourceUrl: {
  (): (input: OverviewSourceLookup) => string | null
  (input: OverviewSourceLookup): string | null
} = recordFunction(
  ({ sourceUrl, tasks, hasReusableOverview }: OverviewSourceLookup): string | null => {
    const identity = videoIdentityFromUrl(sourceUrl)
    if (identity === null) {
      return null
    }
    const matches = A.filter(
      tasks,
      (task, index) =>
        index in tasks &&
        isDownloadTaskKind(task.kind) &&
        videoIdentityFromUrl(task.input.url) === identity
    )
    if (matches.length === 0) {
      return null
    }
    const withOverview = A.filter(matches, (task) => hasReusableOverview(task.id))
    const pool = withOverview.length > 0 ? withOverview : matches
    return [...pool].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? null
  }
)

/**
 * Reuse a Desktop download's Overview when possible; otherwise bind work to that download.
 *
 * @param input Source URL, regenerate flag, local tasks, and a live Overview lookup.
 * @example resolveExtensionOverviewTarget
 * @category utilities
 * @since 0.0.0
 */
export function resolveExtensionOverviewTarget(input: {
  forceRegenerate: boolean
  sourceUrl: string
  ephemeralDownloadId: string
  tasks: readonly OverviewDownloadMatch[]
  overviewFor: (downloadId: string) => AiPromptRunSnapshot | null
}): ExtensionOverviewTarget {
  if (input.forceRegenerate) {
    return {
      downloadId: input.ephemeralDownloadId,
      reused: false,
      snapshot: null
    }
  }
  const downloadId = findDownloadIdForSourceUrl({
    sourceUrl: input.sourceUrl,
    tasks: input.tasks,
    hasReusableOverview: (id) => {
      const snapshot = input.overviewFor(id)
      return snapshot !== null && P.isTruthy(snapshot) && isReusableOverviewSnapshot(snapshot)
    }
  })
  if (downloadId === null) {
    return {
      downloadId: input.ephemeralDownloadId,
      reused: false,
      snapshot: null
    }
  }
  const snapshot = input.overviewFor(downloadId)
  if (snapshot !== null && isReusableOverviewSnapshot(snapshot)) {
    return {
      downloadId,
      reused: true,
      snapshot
    }
  }
  return {
    downloadId,
    reused: false,
    snapshot: null
  }
}

/** OverviewDownloadMatch shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid OverviewDownloadMatch input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { OverviewDownloadMatch } from './extension-overview-reuse.js'
 * strictEqual(S.is(OverviewDownloadMatch)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const OverviewDownloadMatch = S.Struct({
  id: S.String.pipe(S.mutableKey),
  kind: TaskKind.pipe(S.mutableKey),
  input: S.Struct({
    url: S.String.pipe(S.mutableKey)
  }).pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('OverviewDownloadMatch', {
    description: 'OverviewDownloadMatch shared boundary data.'
  })
)
/** Decoded mutable OverviewDownloadMatch data.
 * @category type-level
 * @since 0.0.0
 * @example OverviewDownloadMatch
 */
export type OverviewDownloadMatch = typeof OverviewDownloadMatch.Type

/** ExtensionOverviewTarget shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionOverviewTarget input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionOverviewTarget } from './extension-overview-reuse.js'
 * strictEqual(S.is(ExtensionOverviewTarget)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionOverviewTarget = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  reused: S.Boolean.pipe(S.mutableKey),
  snapshot: S.Union([AiPromptRunSnapshot, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionOverviewTarget', {
    description: 'ExtensionOverviewTarget shared boundary data.'
  })
)
/** Decoded mutable ExtensionOverviewTarget data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionOverviewTarget
 */
export type ExtensionOverviewTarget = typeof ExtensionOverviewTarget.Type
