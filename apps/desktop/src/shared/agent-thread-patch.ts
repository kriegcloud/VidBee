import * as A from 'effect/Array'
import { pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import type {
  AgentEventApplyResult,
  AgentGapRecovery,
  AgentPersistScope,
  AgentRouteIdentity,
  CatalogMemory
} from './AgentPatch.model.js'
import {
  AgentEventApplyResult as ReexportAgentEventApplyResult,
  AgentGapRecovery as ReexportAgentGapRecovery,
  AgentPersistScope as ReexportAgentPersistScope,
  AgentRouteIdentity as ReexportAgentRouteIdentity,
  CatalogMemoryEntry as ReexportCatalogMemoryEntry
} from './AgentPatch.model.js'
import * as Sparse from './ArrayHelpers.js'

export {
  ReexportAgentEventApplyResult as AgentEventApplyResult,
  ReexportAgentGapRecovery as AgentGapRecovery,
  ReexportAgentPersistScope as AgentPersistScope,
  ReexportAgentRouteIdentity as AgentRouteIdentity,
  ReexportCatalogMemoryEntry as CatalogMemoryEntry
}

import {
  type AgentActivity,
  type AgentArtifact,
  type AgentCatalogNotice,
  type AgentChatRun,
  type AgentImageAttachment,
  type AgentRunEvent,
  type AgentRunStatus,
  type AgentThread,
  type AgentThreadPatch,
  type AgentThreadSummary,
  selectedAgentMessages
} from './agent-chat'
import { recordFunction } from './RecordFunction.js'

/** Dirty rows a streaming commit may publish without rewriting the conversation. */

/** Video, prompt, or pinned thread that a renderer is allowed to apply. */

/** Result of comparing one event with the authoritative thread. */

/**
 * In-flight gap repair for one identity.
 * One episode is a single RPC plus one follow-up. A newer seq may open another episode.
 */

/** Remembered catalog notice so a late list cannot undo a newer rename or delete. */

/**
 * Start a gap-repair record with no request outstanding.
 * @example createAgentGapRecovery
 * @category utilities
 * @since 0.0.0
 */
export function createAgentGapRecovery(): AgentGapRecovery {
  return {
    inflight: false,
    observedSeq: 0,
    coveredSeq: 0,
    followUpUsed: false
  }
}

/**
 * Raise the highest seq seen for this identity.
 * @param recovery Current repair record.
 * @param seq Seq observed on an event or accepted snapshot.
 */
function observeAgentSeqBody(recovery: AgentGapRecovery, seq: number): AgentGapRecovery {
  if (!Number.isFinite(seq) || seq <= recovery.observedSeq) {
    return recovery
  }
  return {
    ...recovery,
    observedSeq: seq
  }
}

/**
 * Open one recovery RPC.
 * Gap repairs wait until a seq newer than the last finished episode arrives.
 * Focus and the first load use `refresh` and are not held by that mark.
 * @param recovery Current repair record.
 * @param reason Why this repair was requested.
 */
function requestAgentRecoveryBody(
  recovery: AgentGapRecovery,
  reason: 'gap' | 'refresh' = 'gap'
): {
  recovery: AgentGapRecovery
  action: 'start' | 'busy' | 'wait'
} {
  if (recovery.inflight) {
    return {
      recovery,
      action: 'busy'
    }
  }
  if (reason === 'gap' && recovery.observedSeq <= recovery.coveredSeq) {
    return {
      recovery,
      action: 'wait'
    }
  }
  return {
    recovery: {
      ...recovery,
      inflight: true,
      followUpUsed: false
    },
    action: 'start'
  }
}

/**
 * Finish one recovery RPC. A short snapshot may start one follow-up, never a loop.
 * After that follow-up is still behind, wait for a newer seq instead of retrying now.
 * @param recovery Record that owns the RPC just finished.
 * @param appliedSeq Seq now held for this identity, or 0 when none was accepted.
 */
function settleAgentRecoveryBody(
  recovery: AgentGapRecovery,
  appliedSeq: number
): {
  recovery: AgentGapRecovery
  action: 'settled' | 'follow-up' | 'wait'
} {
  const idle = {
    ...recovery,
    inflight: false
  }
  if (appliedSeq >= idle.observedSeq) {
    return {
      recovery: {
        ...idle,
        followUpUsed: false,
        coveredSeq: idle.observedSeq
      },
      action: 'settled'
    }
  }
  if (!idle.followUpUsed) {
    return {
      recovery: {
        ...idle,
        followUpUsed: true,
        inflight: true
      },
      action: 'follow-up'
    }
  }
  return {
    recovery: {
      ...idle,
      followUpUsed: false,
      coveredSeq: idle.observedSeq
    },
    action: 'wait'
  }
}

/**
 * Allow a focus repair to read again. Does not cancel an RPC already in flight.
 * @param recovery Current repair record.
 * @example resetAgentRecovery
 * @category utilities
 * @since 0.0.0
 */
export function resetAgentRecovery(recovery: AgentGapRecovery): AgentGapRecovery {
  if (recovery.coveredSeq === 0 && !recovery.followUpUsed) {
    return recovery
  }
  return {
    ...recovery,
    followUpUsed: false,
    coveredSeq: 0
  }
}

/**
 * Keep a public artifact without its local filesystem path.
 * @param artifact Stored artifact.
 * @example projectAgentArtifact
 * @category utilities
 * @since 0.0.0
 */
export function projectAgentArtifact(artifact: AgentArtifact): AgentArtifact {
  return {
    ...artifact,
    path: '',
    posterPath: undefined
  }
}

/**
 * Keep a public image without its local filesystem path.
 * @param image Stored image attachment.
 * @example projectAgentImage
 * @category utilities
 * @since 0.0.0
 */
export function projectAgentImage(image: AgentImageAttachment): AgentImageAttachment {
  return {
    ...image,
    path: ''
  }
}

/**
 * Copy one run for IPC, dropping provider-private fields.
 * @param run Stored run. Its private arrays are not reused.
 * @param activity Public activity already projected for this run only.
 */
function projectAgentRunBody(run: AgentChatRun, activity: AgentActivity[]): AgentChatRun {
  return {
    ...run,
    activity,
    rawMessages: [],
    workingNotes: undefined,
    sessionEntries: undefined,
    evidenceCoverage: undefined,
    evidenceSource: undefined,
    fullSourceReview: undefined,
    articleSections: undefined,
    contextCheckpoint: undefined,
    contextSummary: undefined,
    tools: Sparse.map({
      items: run.tools,
      map: (tool) => ({
        ...tool,
        skills:
          tool.skills === undefined || tool.skills === null
            ? undefined
            : Sparse.map({
                items: tool.skills,
                map: (skill) => ({
                  ...skill
                })
              }),
        approval:
          tool.approval === undefined
            ? undefined
            : {
                ...tool.approval
              }
      })
    })
  }
}

/**
 * Copy a whole thread for a snapshot IPC payload.
 * @param thread Stored thread.
 * @param activityFor Called once per run. Pass `agentActivity` from main.
 */
function projectAgentThreadBody(
  thread: AgentThread,
  activityFor: (run: AgentChatRun) => AgentActivity[]
): AgentThread {
  return {
    ...thread,
    messages: Sparse.map({
      items: thread.messages,
      map: (message) => ({
        ...message
      })
    }),
    runs: Sparse.map({
      items: thread.runs,
      map: (run) => projectAgentRunBody(run, activityFor(run))
    }),
    artifacts: Sparse.map({
      items: thread.artifacts,
      map: projectAgentArtifact
    }),
    images:
      thread.images === undefined || thread.images === null
        ? undefined
        : Sparse.map({
            items: thread.images,
            map: projectAgentImage
          })
  }
}

/**
 * Copy only the dirty entities. `activityFor` runs for dirty runs and no others.
 * @param thread Stored thread, including its committed seq.
 * @param scope Rows touched by this commit.
 * @param activityFor Public activity for one run.
 */
function projectAgentPatchBody(
  thread: AgentThread,
  scope: AgentPersistScope,
  activityFor: (run: AgentChatRun) => AgentActivity[]
): AgentThreadPatch {
  const patch: AgentThreadPatch = {
    downloadId: thread.downloadId,
    promptId: thread.promptId,
    threadId: thread.id
  }
  if (P.isTruthy(scope.thread)) {
    patch.leafId = thread.leafId
    if (thread.title !== undefined) {
      patch.title = thread.title
    }
    if (thread.toolGrants !== undefined) {
      patch.toolGrants = [...thread.toolGrants]
    }
    if (thread.images !== undefined) {
      patch.images = Sparse.map({
        items: thread.images,
        map: projectAgentImage
      })
    }
  }
  if (scope.messageIds !== undefined && scope.messageIds.length > 0) {
    const ids = HashSet.fromIterable(scope.messageIds)
    patch.messages = Sparse.map({
      items: Sparse.filter({
        items: thread.messages,
        predicate: (message) => HashSet.has(ids, message.id)
      }),
      map: (message) => ({
        ...message
      })
    })
  }
  if (scope.runIds !== undefined && scope.runIds.length > 0) {
    const ids = HashSet.fromIterable(scope.runIds)
    const runs: AgentChatRun[] = []
    for (const run of thread.runs) {
      if (!HashSet.has(ids, run.id)) {
        continue
      }
      runs.push(projectAgentRunBody(run, activityFor(run)))
    }
    patch.runs = runs
  }
  if (scope.artifactIds !== undefined && scope.artifactIds.length > 0) {
    const ids = HashSet.fromIterable(scope.artifactIds)
    patch.artifacts = Sparse.map({
      items: Sparse.filter({
        items: thread.artifacts,
        predicate: (artifact) => HashSet.has(ids, artifact.id)
      }),
      map: projectAgentArtifact
    })
  }
  return patch
}

/**
 * Event header safe to store. Snapshot, patch, and catalog payloads stay off the row.
 * @param event Event about to be broadcast.
 * @example durableAgentEvent
 * @category utilities
 * @since 0.0.0
 */
export function durableAgentEvent(
  event: AgentRunEvent
): Pick<AgentRunEvent, 'threadId' | 'runId' | 'messageId' | 'seq' | 'type' | 'createdAt'> {
  return {
    threadId: event.threadId,
    runId: event.runId,
    messageId: event.messageId,
    seq: event.seq,
    type: event.type,
    createdAt: event.createdAt
  }
}

/**
 * Route a snapshot or patch. Catalog-only notices have no thread route.
 * @param event Broadcast event.
 * @example agentEventRoute
 * @category utilities
 * @since 0.0.0
 */
export function agentEventRoute(event: AgentRunEvent): {
  downloadId: string
  promptId: string
  threadId: string
} | null {
  if (event.patch !== undefined) {
    return {
      downloadId: event.patch.downloadId,
      promptId: event.patch.promptId,
      threadId: event.patch.threadId
    }
  }
  if (event.snapshot !== undefined) {
    return {
      downloadId: event.snapshot.downloadId,
      promptId: event.snapshot.promptId,
      threadId: event.snapshot.id
    }
  }
  return null
}

/**
 * True when the event belongs to the renderer's current video and prompt or thread.
 * @param event Broadcast event.
 * @param identity Tab identity. `threadId` pins one conversation.
 */
function agentEventMatchesBody(event: AgentRunEvent, identity: AgentRouteIdentity): boolean {
  const route = agentEventRoute(event)
  if (route === null || !P.isTruthy(route) || route.downloadId !== identity.downloadId) {
    return false
  }
  if (
    identity.threadId !== undefined &&
    identity.threadId !== null &&
    P.isTruthy(identity.threadId)
  ) {
    return route.threadId === identity.threadId
  }
  return route.promptId === identity.promptId
}

/**
 * Replace entities by id. The array is copied when any row changes; other rows keep their identity.
 * @param current Current array. It is not mutated.
 * @param updates Replacement or new rows.
 */
function replaceById<
  T extends {
    id: string
  }
>(current: T[], updates: readonly T[] | undefined): T[] {
  if (updates === undefined || !P.isTruthy(updates.length)) {
    return current
  }
  const next = A.copy(current)
  for (const item of updates) {
    const index = pipe(
      next,
      A.findFirstIndex((row) => row.id === item.id),
      O.getOrElse(() => -1)
    )
    if (index === -1) {
      next.push(item)
    } else {
      next[index] = item
    }
  }
  return next
}

/**
 * Apply one patch onto a thread without mutating either object.
 * @param current Authoritative thread.
 * @param patch Dirty public entities.
 * @param seq Committed seq of the patch event.
 */
function applyAgentThreadPatchBody(
  current: AgentThread,
  patch: AgentThreadPatch,
  seq: number
): AgentThread {
  return {
    ...current,
    seq,
    leafId: patch.leafId === undefined ? current.leafId : patch.leafId,
    title: patch.title === undefined ? current.title : patch.title,
    toolGrants: patch.toolGrants === undefined ? current.toolGrants : [...patch.toolGrants],
    messages: replaceById(current.messages, patch.messages),
    runs: replaceById(current.runs, patch.runs),
    artifacts: replaceById(current.artifacts, patch.artifacts),
    images:
      patch.images === undefined
        ? current.images
        : Sparse.map({
            items: patch.images,
            map: (image) => ({
              ...image
            })
          })
  }
}

/**
 * Accept a full thread only when its seq is newer. Equal seq keeps the local object.
 * @param current Authoritative thread, or null before hydration.
 * @param incoming Snapshot from IPC or an applied patch.
 */
function acceptAgentThreadBody(current: AgentThread | null, incoming: AgentThread): AgentThread {
  if (current !== null && current.id === incoming.id && current.seq >= incoming.seq) {
    return current
  }
  return incoming
}

/**
 * Compare one event with the authoritative thread.
 * Snapshots may skip seqs. Patches apply only at `current.seq + 1`.
 * @param current Authoritative thread for this identity.
 * @param event Broadcast event.
 * @param identity Current video, prompt, and optional pinned thread.
 */
function applyAgentRunEventBody(
  current: AgentThread | null,
  event: AgentRunEvent,
  identity: AgentRouteIdentity
): AgentEventApplyResult {
  if (!agentEventMatchesBody(event, identity)) {
    return {
      kind: 'ignored'
    }
  }
  if (event.snapshot !== undefined) {
    if (current !== null && current.id === event.snapshot.id && current.seq >= event.snapshot.seq) {
      return {
        kind: 'unchanged',
        thread: current
      }
    }
    return {
      kind: 'applied',
      thread: event.snapshot
    }
  }
  if (event.patch === undefined || !P.isTruthy(event.patch)) {
    return {
      kind: 'ignored'
    }
  }
  if (current === null || !P.isTruthy(current) || current.id !== event.patch.threadId) {
    return {
      kind: 'gap',
      thread: current,
      observedSeq: event.seq
    }
  }
  if (event.seq <= current.seq) {
    return {
      kind: 'unchanged',
      thread: current
    }
  }
  if (event.seq !== current.seq + 1) {
    return {
      kind: 'gap',
      thread: current,
      observedSeq: event.seq
    }
  }
  return {
    kind: 'applied',
    thread: applyAgentThreadPatchBody(current, event.patch, event.seq)
  }
}

/**
 * Status of the selected branch. Branch changes this even when the title does not.
 * @param thread Public or stored thread.
 * @example selectedAgentRunView
 * @category utilities
 * @since 0.0.0
 */
export function selectedAgentRunView(thread: AgentThread): {
  status: AgentRunStatus | 'idle'
  updatedAt: number
} {
  const latest = selectedAgentMessages(thread).at(-1)
  const run =
    latest === undefined
      ? undefined
      : O.getOrUndefined(A.findFirst(thread.runs, (item) => item.messageId === latest.id))
  return {
    status: run?.status ?? 'idle',
    updatedAt: run?.updatedAt ?? latest?.createdAt ?? 0
  }
}

/**
 * Record a catalog notice when its revision is newer. Thread seq is not consulted.
 * @param memory Notices already applied.
 * @param notice Directory notice from main.
 */
function rememberCatalogBody(
  memory: CatalogMemory,
  notice: AgentCatalogNotice
): {
  memory: CatalogMemory
  applied: boolean
} {
  const id = notice.kind === 'remove' ? notice.id : notice.summary.id
  const downloadId = notice.kind === 'remove' ? notice.downloadId : notice.summary.downloadId
  const previous = pipe(memory.entries, HashMap.get(id), O.getOrUndefined)
  if (previous !== undefined && notice.revision <= previous.revision) {
    return {
      memory,
      applied: false
    }
  }
  const next: CatalogMemory = {
    entries: memory.entries,
    keys: HashMap.has(memory.entries, id) ? memory.keys : [...memory.keys, id]
  }
  if (notice.kind === 'remove') {
    next.entries = HashMap.set(next.entries, id, {
      revision: notice.revision,
      removed: true,
      history: false,
      downloadId
    })
    return {
      memory: next,
      applied: true
    }
  }
  next.entries = HashMap.set(next.entries, id, {
    revision: notice.revision,
    removed: false,
    history: notice.history,
    downloadId,
    summary: notice.summary
  })
  return {
    memory: next,
    applied: true
  }
}

/**
 * Overlay notices that arrived after a list request started.
 * @param rows Rows returned by a list RPC.
 * @param memory Notices applied locally.
 * @param requestedRevision Highest revision already applied when the RPC started.
 * @param options Limit to one video, or to history membership.
 */
function mergeCatalogListBody(
  rows: readonly AgentThreadSummary[],
  memory: CatalogMemory,
  requestedRevision: number,
  options?: {
    downloadId?: string
    historyOnly?: boolean
  }
): AgentThreadSummary[] {
  let entries = HashMap.empty<string, AgentThreadSummary>()
  let keys: string[] = []
  for (const row of rows) {
    if (P.isTruthy(options?.downloadId) && row.downloadId !== options?.downloadId) {
      continue
    }
    if (!HashMap.has(entries, row.id)) {
      keys.push(row.id)
    }
    entries = HashMap.set(entries, row.id, row)
  }
  for (const id of memory.keys) {
    const state = pipe(memory.entries, HashMap.get(id), O.getOrUndefined)
    if (state === undefined || state.revision <= requestedRevision) {
      continue
    }
    if (P.isTruthy(options?.downloadId) && state.downloadId !== options?.downloadId) {
      continue
    }
    if (
      P.isTruthy(state.removed) ||
      (P.isTruthy(options?.historyOnly) && !P.isTruthy(state.history))
    ) {
      entries = HashMap.remove(entries, id)
      keys = A.filter(keys, (key) => key !== id)
      continue
    }
    if (state.summary !== undefined) {
      if (!HashMap.has(entries, id)) {
        keys.push(id)
      }
      entries = HashMap.set(entries, id, state.summary)
    }
  }
  const result: AgentThreadSummary[] = []
  for (const key of keys) {
    const value = HashMap.get(entries, key)
    if (O.isSome(value)) {
      result.push(value.value)
    }
  }
  return result
}

/** Record contract for observeAgentSeq.
 * @category ports
 * @since 0.0.0
 * @example ObserveAgentSeqInput
 */
export interface ObserveAgentSeqInput {
  recovery: AgentGapRecovery
  seq: number
}
/** observeAgentSeq with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example observeAgentSeq
 */
export const observeAgentSeq: {
  (): (input: ObserveAgentSeqInput) => AgentGapRecovery
  (input: ObserveAgentSeqInput): AgentGapRecovery
} = recordFunction(
  (input: ObserveAgentSeqInput): AgentGapRecovery => observeAgentSeqBody(input.recovery, input.seq)
)
/** Record contract for requestAgentRecovery.
 * @category ports
 * @since 0.0.0
 * @example RequestAgentRecoveryInput
 */
export interface RequestAgentRecoveryInput {
  recovery: AgentGapRecovery
  reason?: 'gap' | 'refresh' | undefined
}
/** requestAgentRecovery with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example requestAgentRecovery
 */
export const requestAgentRecovery: {
  (): (input: RequestAgentRecoveryInput) => {
    recovery: AgentGapRecovery
    action: 'start' | 'busy' | 'wait'
  }
  (
    input: RequestAgentRecoveryInput
  ): {
    recovery: AgentGapRecovery
    action: 'start' | 'busy' | 'wait'
  }
} = recordFunction(
  (
    input: RequestAgentRecoveryInput
  ): {
    recovery: AgentGapRecovery
    action: 'start' | 'busy' | 'wait'
  } => requestAgentRecoveryBody(input.recovery, input.reason)
)
/** Record contract for settleAgentRecovery.
 * @category ports
 * @since 0.0.0
 * @example SettleAgentRecoveryInput
 */
export interface SettleAgentRecoveryInput {
  recovery: AgentGapRecovery
  appliedSeq: number
}
/** settleAgentRecovery with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example settleAgentRecovery
 */
export const settleAgentRecovery: {
  (): (input: SettleAgentRecoveryInput) => {
    recovery: AgentGapRecovery
    action: 'settled' | 'follow-up' | 'wait'
  }
  (
    input: SettleAgentRecoveryInput
  ): {
    recovery: AgentGapRecovery
    action: 'settled' | 'follow-up' | 'wait'
  }
} = recordFunction(
  (
    input: SettleAgentRecoveryInput
  ): {
    recovery: AgentGapRecovery
    action: 'settled' | 'follow-up' | 'wait'
  } => settleAgentRecoveryBody(input.recovery, input.appliedSeq)
)
/** Record contract for projectAgentRun.
 * @category ports
 * @since 0.0.0
 * @example ProjectAgentRunInput
 */
export interface ProjectAgentRunInput {
  run: AgentChatRun
  activity: AgentActivity[]
}
/** projectAgentRun with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example projectAgentRun
 */
export const projectAgentRun: {
  (): (input: ProjectAgentRunInput) => AgentChatRun
  (input: ProjectAgentRunInput): AgentChatRun
} = recordFunction(
  (input: ProjectAgentRunInput): AgentChatRun => projectAgentRunBody(input.run, input.activity)
)
/** Record contract for projectAgentThread.
 * @category ports
 * @since 0.0.0
 * @example ProjectAgentThreadInput
 */
export interface ProjectAgentThreadInput {
  thread: AgentThread
  activityFor: (run: AgentChatRun) => AgentActivity[]
}
/** projectAgentThread with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example projectAgentThread
 */
export const projectAgentThread: {
  (): (input: ProjectAgentThreadInput) => AgentThread
  (input: ProjectAgentThreadInput): AgentThread
} = recordFunction(
  (input: ProjectAgentThreadInput): AgentThread =>
    projectAgentThreadBody(input.thread, input.activityFor)
)
/** Record contract for projectAgentPatch.
 * @category ports
 * @since 0.0.0
 * @example ProjectAgentPatchInput
 */
export interface ProjectAgentPatchInput {
  thread: AgentThread
  scope: AgentPersistScope
  activityFor: (run: AgentChatRun) => AgentActivity[]
}
/** projectAgentPatch with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example projectAgentPatch
 */
export const projectAgentPatch: {
  (): (input: ProjectAgentPatchInput) => AgentThreadPatch
  (input: ProjectAgentPatchInput): AgentThreadPatch
} = recordFunction(
  (input: ProjectAgentPatchInput): AgentThreadPatch =>
    projectAgentPatchBody(input.thread, input.scope, input.activityFor)
)
/** Record contract for agentEventMatches.
 * @category ports
 * @since 0.0.0
 * @example AgentEventMatchesInput
 */
export interface AgentEventMatchesInput {
  event: AgentRunEvent
  identity: AgentRouteIdentity
}
/** agentEventMatches with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example agentEventMatches
 */
export const agentEventMatches: {
  (): (input: AgentEventMatchesInput) => boolean
  (input: AgentEventMatchesInput): boolean
} = recordFunction((input: AgentEventMatchesInput): boolean =>
  agentEventMatchesBody(input.event, input.identity)
)
/** Record contract for applyAgentThreadPatch.
 * @category ports
 * @since 0.0.0
 * @example ApplyAgentThreadPatchInput
 */
export interface ApplyAgentThreadPatchInput {
  current: AgentThread
  patch: AgentThreadPatch
  seq: number
}
/** applyAgentThreadPatch with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example applyAgentThreadPatch
 */
export const applyAgentThreadPatch: {
  (): (input: ApplyAgentThreadPatchInput) => AgentThread
  (input: ApplyAgentThreadPatchInput): AgentThread
} = recordFunction(
  (input: ApplyAgentThreadPatchInput): AgentThread =>
    applyAgentThreadPatchBody(input.current, input.patch, input.seq)
)
/** Record contract for acceptAgentThread.
 * @category ports
 * @since 0.0.0
 * @example AcceptAgentThreadInput
 */
export interface AcceptAgentThreadInput {
  current: AgentThread | null
  incoming: AgentThread
}
/** acceptAgentThread with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example acceptAgentThread
 */
export const acceptAgentThread: {
  (): (input: AcceptAgentThreadInput) => AgentThread
  (input: AcceptAgentThreadInput): AgentThread
} = recordFunction(
  (input: AcceptAgentThreadInput): AgentThread =>
    acceptAgentThreadBody(input.current, input.incoming)
)
/** Record contract for applyAgentRunEvent.
 * @category ports
 * @since 0.0.0
 * @example ApplyAgentRunEventInput
 */
export interface ApplyAgentRunEventInput {
  current: AgentThread | null
  event: AgentRunEvent
  identity: AgentRouteIdentity
}
/** applyAgentRunEvent with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example applyAgentRunEvent
 */
export const applyAgentRunEvent: {
  (): (input: ApplyAgentRunEventInput) => AgentEventApplyResult
  (input: ApplyAgentRunEventInput): AgentEventApplyResult
} = recordFunction(
  (input: ApplyAgentRunEventInput): AgentEventApplyResult =>
    applyAgentRunEventBody(input.current, input.event, input.identity)
)
/** Record contract for rememberCatalog.
 * @category ports
 * @since 0.0.0
 * @example RememberCatalogInput
 */
export interface RememberCatalogInput {
  memory: CatalogMemory
  notice: AgentCatalogNotice
}
/** rememberCatalog with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example rememberCatalog
 */
export const rememberCatalog: {
  (): (input: RememberCatalogInput) => {
    memory: CatalogMemory
    applied: boolean
  }
  (
    input: RememberCatalogInput
  ): {
    memory: CatalogMemory
    applied: boolean
  }
} = recordFunction(
  (
    input: RememberCatalogInput
  ): {
    memory: CatalogMemory
    applied: boolean
  } => rememberCatalogBody(input.memory, input.notice)
)
/** Record contract for mergeCatalogList.
 * @category ports
 * @since 0.0.0
 * @example MergeCatalogListInput
 */
export interface MergeCatalogListInput {
  rows: readonly AgentThreadSummary[]
  memory: CatalogMemory
  requestedRevision: number
  options?:
    | {
        downloadId?: string
        historyOnly?: boolean
      }
    | undefined
}
/** mergeCatalogList with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example mergeCatalogList
 */
export const mergeCatalogList: {
  (): (input: MergeCatalogListInput) => AgentThreadSummary[]
  (input: MergeCatalogListInput): AgentThreadSummary[]
} = recordFunction((input: MergeCatalogListInput): AgentThreadSummary[] =>
  mergeCatalogListBody(input.rows, input.memory, input.requestedRevision, input.options)
)
