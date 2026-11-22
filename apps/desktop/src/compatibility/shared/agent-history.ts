// Retain the old constant import's eager authored-skill initialization.
import '../../shared/ai-prompts'

import * as Native from '../../shared/agent-history'
import {
  type AgentConversationTitleInput as ReexportAgentConversationTitleInput,
  type AgentHistoryCalendar as ReexportAgentHistoryCalendar,
  type AgentHistoryDisplayTitleInput as ReexportAgentHistoryDisplayTitleInput,
  type AgentHistoryGroup as ReexportAgentHistoryGroup,
  type AgentHistoryGroupKind as ReexportAgentHistoryGroupKind,
  agentThreadIsRunning as ReexportagentThreadIsRunning,
  agentThreadLatestRun as ReexportagentThreadLatestRun,
  agentThreadNeedsApproval as ReexportagentThreadNeedsApproval,
  agentThreadUpdatedAt as ReexportagentThreadUpdatedAt,
  agentThreadUserPreview as ReexportagentThreadUserPreview,
  isUuid as ReexportisUuid,
  sanitizeAgentConversationTitle as ReexportsanitizeAgentConversationTitle
} from '../../shared/agent-history'

export {
  type ReexportAgentConversationTitleInput as AgentConversationTitleInput,
  type ReexportAgentHistoryCalendar as AgentHistoryCalendar,
  type ReexportAgentHistoryDisplayTitleInput as AgentHistoryDisplayTitleInput,
  type ReexportAgentHistoryGroup as AgentHistoryGroup,
  type ReexportAgentHistoryGroupKind as AgentHistoryGroupKind,
  ReexportagentThreadIsRunning as agentThreadIsRunning,
  ReexportagentThreadLatestRun as agentThreadLatestRun,
  ReexportagentThreadNeedsApproval as agentThreadNeedsApproval,
  ReexportagentThreadUpdatedAt as agentThreadUpdatedAt,
  ReexportagentThreadUserPreview as agentThreadUserPreview,
  ReexportisUuid as isUuid,
  ReexportsanitizeAgentConversationTitle as sanitizeAgentConversationTitle
}

import type { AgentThread, AgentThreadSummary } from '../../shared/agent-chat'
export function agentConversationTitle(thread: AgentThread, videoTitle: string): string {
  return Native.agentConversationTitle({
    thread,
    videoTitle
  })
}
export function agentHistoryDisplayTitle(
  item: AgentThreadSummary,
  untitled: string,
  promptLabel: string
): string {
  return Native.agentHistoryDisplayTitle({
    item,
    untitled,
    promptLabel
  })
}
const calendar: Native.AgentHistoryCalendar = {
  startOfLocalDay(ms) {
    const date = new Date(ms)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  },
  format({ ms, locale, kind }) {
    return new Intl.DateTimeFormat(
      locale,
      kind === 'weekday'
        ? {
            weekday: 'long'
          }
        : {
            dateStyle: 'medium'
          }
    ).format(new Date(ms))
  }
}
export function startOfLocalDay(ms: number): number {
  return Native.startOfLocalDay({
    ms,
    calendar
  })
}
export function groupAgentHistory<
  T extends {
    id: string
    updatedAt: number
  }
>(items: T[], now: number, locale: string): Native.AgentHistoryGroup<T>[] {
  return Native.groupAgentHistory({
    items,
    now,
    locale,
    calendar
  })
}
