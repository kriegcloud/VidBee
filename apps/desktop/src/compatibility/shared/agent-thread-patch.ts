import * as HashMap from 'effect/HashMap'
import * as O from 'effect/Option'
import * as Native from '../../shared/agent-thread-patch'
import {
  type AcceptAgentThreadInput as ReexportAcceptAgentThreadInput,
  AgentEventApplyResult as ReexportAgentEventApplyResult,
  type AgentEventMatchesInput as ReexportAgentEventMatchesInput,
  AgentGapRecovery as ReexportAgentGapRecovery,
  AgentPersistScope as ReexportAgentPersistScope,
  AgentRouteIdentity as ReexportAgentRouteIdentity,
  type ApplyAgentRunEventInput as ReexportApplyAgentRunEventInput,
  type ApplyAgentThreadPatchInput as ReexportApplyAgentThreadPatchInput,
  agentEventRoute as ReexportagentEventRoute,
  CatalogMemoryEntry as ReexportCatalogMemoryEntry,
  createAgentGapRecovery as ReexportcreateAgentGapRecovery,
  durableAgentEvent as ReexportdurableAgentEvent,
  type MergeCatalogListInput as ReexportMergeCatalogListInput,
  type ObserveAgentSeqInput as ReexportObserveAgentSeqInput,
  type ProjectAgentPatchInput as ReexportProjectAgentPatchInput,
  type ProjectAgentRunInput as ReexportProjectAgentRunInput,
  type ProjectAgentThreadInput as ReexportProjectAgentThreadInput,
  projectAgentArtifact as ReexportprojectAgentArtifact,
  projectAgentImage as ReexportprojectAgentImage,
  type RememberCatalogInput as ReexportRememberCatalogInput,
  type RequestAgentRecoveryInput as ReexportRequestAgentRecoveryInput,
  resetAgentRecovery as ReexportresetAgentRecovery,
  type SettleAgentRecoveryInput as ReexportSettleAgentRecoveryInput,
  selectedAgentRunView as ReexportselectedAgentRunView
} from '../../shared/agent-thread-patch'

export {
  type ReexportAcceptAgentThreadInput as AcceptAgentThreadInput,
  ReexportAgentEventApplyResult as AgentEventApplyResult,
  type ReexportAgentEventMatchesInput as AgentEventMatchesInput,
  ReexportAgentGapRecovery as AgentGapRecovery,
  ReexportAgentPersistScope as AgentPersistScope,
  ReexportAgentRouteIdentity as AgentRouteIdentity,
  type ReexportApplyAgentRunEventInput as ApplyAgentRunEventInput,
  type ReexportApplyAgentThreadPatchInput as ApplyAgentThreadPatchInput,
  ReexportagentEventRoute as agentEventRoute,
  ReexportCatalogMemoryEntry as CatalogMemoryEntry,
  ReexportcreateAgentGapRecovery as createAgentGapRecovery,
  ReexportdurableAgentEvent as durableAgentEvent,
  type ReexportMergeCatalogListInput as MergeCatalogListInput,
  type ReexportObserveAgentSeqInput as ObserveAgentSeqInput,
  type ReexportProjectAgentPatchInput as ProjectAgentPatchInput,
  type ReexportProjectAgentRunInput as ProjectAgentRunInput,
  type ReexportProjectAgentThreadInput as ProjectAgentThreadInput,
  ReexportprojectAgentArtifact as projectAgentArtifact,
  ReexportprojectAgentImage as projectAgentImage,
  type ReexportRememberCatalogInput as RememberCatalogInput,
  type ReexportRequestAgentRecoveryInput as RequestAgentRecoveryInput,
  ReexportresetAgentRecovery as resetAgentRecovery,
  type ReexportSettleAgentRecoveryInput as SettleAgentRecoveryInput,
  ReexportselectedAgentRunView as selectedAgentRunView
}

import type {
  AgentActivity,
  AgentCatalogNotice,
  AgentChatRun,
  AgentRunEvent,
  AgentThread,
  AgentThreadPatch,
  AgentThreadSummary
} from '../../shared/agent-chat'
import type {
  AgentEventApplyResult,
  AgentGapRecovery,
  AgentPersistScope,
  AgentRouteIdentity,
  CatalogMemoryEntry
} from '../../shared/agent-thread-patch'
export function observeAgentSeq(recovery: AgentGapRecovery, seq: number): AgentGapRecovery {
  return Native.observeAgentSeq({
    recovery,
    seq
  })
}
export function requestAgentRecovery(
  recovery: AgentGapRecovery,
  reason: 'gap' | 'refresh' = 'gap'
): {
  recovery: AgentGapRecovery
  action: 'start' | 'busy' | 'wait'
} {
  return Native.requestAgentRecovery({
    recovery,
    reason
  })
}
export function settleAgentRecovery(
  recovery: AgentGapRecovery,
  appliedSeq: number
): {
  recovery: AgentGapRecovery
  action: 'settled' | 'follow-up' | 'wait'
} {
  return Native.settleAgentRecovery({
    recovery,
    appliedSeq
  })
}
export function projectAgentRun(run: AgentChatRun, activity: AgentActivity[]): AgentChatRun {
  return Native.projectAgentRun({
    run,
    activity
  })
}
export function projectAgentThread(
  thread: AgentThread,
  activityFor: (run: AgentChatRun) => AgentActivity[]
): AgentThread {
  return Native.projectAgentThread({
    thread,
    activityFor
  })
}
export function projectAgentPatch(
  thread: AgentThread,
  scope: AgentPersistScope,
  activityFor: (run: AgentChatRun) => AgentActivity[]
): AgentThreadPatch {
  return Native.projectAgentPatch({
    thread,
    scope,
    activityFor
  })
}
export function agentEventMatches(event: AgentRunEvent, identity: AgentRouteIdentity): boolean {
  return Native.agentEventMatches({
    event,
    identity
  })
}
export function applyAgentThreadPatch(
  current: AgentThread,
  patch: AgentThreadPatch,
  seq: number
): AgentThread {
  return Native.applyAgentThreadPatch({
    current,
    patch,
    seq
  })
}
export function acceptAgentThread(current: AgentThread | null, incoming: AgentThread): AgentThread {
  return Native.acceptAgentThread({
    current,
    incoming
  })
}
export function applyAgentRunEvent(
  current: AgentThread | null,
  event: AgentRunEvent,
  identity: AgentRouteIdentity
): AgentEventApplyResult {
  return Native.applyAgentRunEvent({
    current,
    event,
    identity
  })
}
export function rememberCatalog(
  memory: ReadonlyMap<string, CatalogMemoryEntry>,
  notice: AgentCatalogNotice
): {
  memory: Map<string, CatalogMemoryEntry>
  applied: boolean
} {
  const result = Native.rememberCatalog({
    memory: {
      entries: HashMap.fromIterable(memory),
      keys: [...memory.keys()]
    },
    notice
  })
  if (!result.applied) {
    return {
      memory: memory as Map<string, CatalogMemoryEntry>,
      applied: false
    }
  }
  const rows: [string, CatalogMemoryEntry][] = []
  for (const key of result.memory.keys) {
    const value = HashMap.get(result.memory.entries, key)
    if (O.isSome(value)) {
      rows.push([key, value.value])
    }
  }
  return {
    memory: new Map(rows),
    applied: true
  }
}
export function mergeCatalogList(
  rows: readonly AgentThreadSummary[],
  memory: ReadonlyMap<string, CatalogMemoryEntry>,
  requestedRevision: number,
  options?: {
    downloadId?: string
    historyOnly?: boolean
  }
): AgentThreadSummary[] {
  return Native.mergeCatalogList({
    rows,
    memory: {
      entries: HashMap.fromIterable(memory),
      keys: [...memory.keys()]
    },
    requestedRevision,
    options
  })
}
