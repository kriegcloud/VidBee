import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as HM from 'effect/HashMap'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import * as Sparse from './ArrayHelpers'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/agent-history')

import { AI_CHAT_PROMPT_ID } from './AiPromptIds'
import type { AgentChatRun, AgentThread, AgentThreadSummary } from './agent-chat'

const DAY_MS = 86_400_000
const TITLE_MAX = 80
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True when the value is a canonical 8-4-4-4-12 hex UUID.
 *
 * @param value Candidate identifier.
 * @example isUuid
 * @category utilities
 * @since 0.0.0
 */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}

/**
 * Collapse whitespace and cap length for a conversation tab title.
 *
 * @param value Raw title from the Agent or the user.
 * @example sanitizeAgentConversationTitle
 * @category utilities
 * @since 0.0.0
 */
export function sanitizeAgentConversationTitle(value: string): string {
  return Str.slice(0, TITLE_MAX)(Str.replace(/\s+/g, ' ')(Str.trim(value)))
}

/** History bucket names; structural for legacy construction.
 * **Example** (Reject invalid AgentHistoryGroupKind input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentHistoryGroupKind } from './agent-history.js'
 * strictEqual(S.is(AgentHistoryGroupKind)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentHistoryGroupKind = LiteralKit(['today', 'yesterday', 'weekday', 'date']).pipe(
  $I.annoteSchema('AgentHistoryGroupKind', {
    description: 'Local calendar bucket.'
  })
)
/** AgentHistoryGroupKind shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentHistoryGroupKind
 */
export type AgentHistoryGroupKind = typeof AgentHistoryGroupKind.Type

/** Calendar projection, structural for legacy construction.
 * @example AgentHistoryGroup(S.String)
 * @category schemas
 * @since 0.0.0
 */
export const AgentHistoryGroup = <Item extends S.Constraint>(item: Item) =>
  S.Struct({
    key: S.String.pipe(S.mutableKey),
    kind: AgentHistoryGroupKind.pipe(S.mutableKey),
    label: S.String.pipe(S.optional, S.mutableKey),
    items: S.Array(item).pipe(S.mutable, S.mutableKey)
  }).pipe(
    $I.annoteSchema('AgentHistoryGroup', {
      description: 'Ordered calendar group.'
    })
  )
/** AgentHistoryGroup shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentHistoryGroup
 */
export type AgentHistoryGroup<T> = ReturnType<typeof AgentHistoryGroup<S.Schema<T>>>['Type']
/** Injected local calendar operations; the compatibility entrypoint supplies Date and Intl.
 * @category ports
 * @since 0.0.0
 * @example AgentHistoryCalendar
 */
export interface AgentHistoryCalendar {
  startOfLocalDay: (ms: number) => number
  format: (input: { ms: number; locale: string; kind: 'weekday' | 'date' }) => string
}

/**
 * Local midnight for a timestamp so history groups follow the user's calendar day.
 *
 * @param ms Epoch milliseconds.
 * @example startOfLocalDay
 * @category utilities
 * @since 0.0.0
 */
export function startOfLocalDay(input: { ms: number; calendar: AgentHistoryCalendar }): number {
  return input.calendar.startOfLocalDay(input.ms)
}

/**
 * One-line preview of the first user message on a conversation.
 *
 * @param thread Persisted agent thread.
 * @example agentThreadUserPreview
 * @category utilities
 * @since 0.0.0
 */
export function agentThreadUserPreview(thread: AgentThread): string {
  for (const message of thread.messages) {
    if (message.role !== 'user') {
      continue
    }
    const line =
      (Str.split('\n')(Str.trim(message.text))[0] === undefined ||
      Str.split('\n')(Str.trim(message.text))[0] === null
        ? undefined
        : Str.trim(Str.split('\n')(Str.trim(message.text))[0])) ?? ''
    if (P.isTruthy(line)) {
      return Str.slice(0, 80)(line)
    }
  }
  const image = thread.images?.[0]
  return image === undefined || image === null ? '' : Str.slice(0, 80)(image.name)
}

/**
 * History title: freeform chats prefer the first user message, prompt chats prefer the video title.
 *
 * @param thread Persisted agent thread.
 * @param videoTitle Title of the source video, if known.
 */
function agentConversationTitleBody(thread: AgentThread, videoTitle: string): string {
  const named = sanitizeAgentConversationTitle(thread.title ?? '')
  if (P.isTruthy(named)) {
    return named
  }
  const userTitle = agentThreadUserPreview(thread)
  const video = Str.trim(videoTitle)
  if (thread.promptId === AI_CHAT_PROMPT_ID) {
    return userTitle
  }
  return video || userTitle
}

/**
 * True when the conversation still has a live model run.
 *
 * @param thread Persisted agent thread.
 * @example agentThreadIsRunning
 * @category utilities
 * @since 0.0.0
 */
export function agentThreadIsRunning(thread: AgentThread): boolean {
  return Sparse.some({ items: thread.runs, predicate: (run) => run.status === 'running' })
}

/** True while any live run in the conversation is waiting for manual permission.  * @example agentThreadNeedsApproval
 * @category utilities
 * @since 0.0.0
 */
export function agentThreadNeedsApproval(thread: AgentThread): boolean {
  return Sparse.some({
    items: thread.runs,
    predicate: (run) =>
      run.status === 'running' &&
      Sparse.some({ items: run.tools, predicate: (tool) => tool.status === 'pending-approval' })
  })
}

/**
 * The run the download list reports: a live run first, otherwise the most recently updated.
 *
 * @param thread Persisted agent thread.
 * @example agentThreadLatestRun
 * @category utilities
 * @since 0.0.0
 */
export function agentThreadLatestRun(thread: AgentThread): AgentChatRun | undefined {
  let latest: AgentChatRun | undefined
  for (const run of thread.runs) {
    if (run.status === 'running') {
      return run
    }
    if (latest === undefined || run.updatedAt > latest.updatedAt) {
      latest = run
    }
  }
  return latest
}

/**
 * Latest product timestamp on a thread, ignoring empty conversations.
 *
 * @param thread Persisted agent thread.
 * @example agentThreadUpdatedAt
 * @category utilities
 * @since 0.0.0
 */
export function agentThreadUpdatedAt(thread: AgentThread): number {
  let latest = 0
  for (const message of thread.messages) {
    if (message.createdAt > latest) {
      latest = message.createdAt
    }
  }
  for (const run of thread.runs) {
    if (run.updatedAt > latest) {
      latest = run.updatedAt
    }
  }
  for (const image of thread.images ?? []) {
    if (image.createdAt > latest) {
      latest = image.createdAt
    }
  }
  return latest
}

/**
 * Group conversations into today, yesterday, this-week weekdays, then dates.
 *
 * @param items History rows, newest first preferred but not required.
 * @param now Epoch milliseconds used as "today".
 * @param locale BCP 47 tag for weekday and date labels.
 */
function groupAgentHistoryBody<
  T extends {
    id: string
    updatedAt: number
  }
>(items: T[], now: number, locale: string, calendar: AgentHistoryCalendar): AgentHistoryGroup<T>[] {
  const byUpdated = (left: T, right: T): number => right.updatedAt - left.updatedAt
  const rest = [...items].sort(byUpdated)
  const today = calendar.startOfLocalDay(now)
  let groups = HM.empty<string, AgentHistoryGroup<T>>()
  const order: string[] = []
  const ensure = (key: string, group: AgentHistoryGroup<T>): AgentHistoryGroup<T> => {
    const existing = O.getOrUndefined(HM.get(groups, key))
    if (existing !== undefined) {
      return existing
    }
    groups = HM.set(groups, key, group)
    order.push(key)
    return group
  }
  for (const item of rest) {
    const start = calendar.startOfLocalDay(item.updatedAt)
    const diff = Math.round((today - start) / DAY_MS)
    let key: string
    let kind: AgentHistoryGroupKind
    let label: string | undefined
    if (diff <= 0) {
      key = 'today'
      kind = 'today'
    } else if (diff === 1) {
      key = 'yesterday'
      kind = 'yesterday'
    } else if (diff < 7) {
      key = `weekday:${start}`
      kind = 'weekday'
      label = calendar.format({
        locale,
        ms: item.updatedAt,
        kind: 'weekday'
      })
    } else {
      key = `date:${start}`
      kind = 'date'
      label = calendar.format({
        locale,
        ms: item.updatedAt,
        kind: 'date'
      })
    }
    ensure(key, {
      key,
      kind,
      label,
      items: []
    }).items.push(item)
  }
  const result: AgentHistoryGroup<T>[] = []
  for (const key of order) {
    const group = O.getOrUndefined(HM.get(groups, key))
    if (group !== undefined) {
      result.push(group)
    }
  }
  return result
}

/**
 * Visible title for a history row. Blank chats use the first user message; prompt threads keep the prompt name.
 *
 * @param item Row being rendered.
 * @param untitled Fallback when the video has no title.
 * @param promptLabel Translated prompt or Chat label.
 */
function agentHistoryDisplayTitleBody(
  item: AgentThreadSummary,
  untitled: string,
  promptLabel: string
): string {
  const title = Str.trim(item.title)
  if (item.promptId === AI_CHAT_PROMPT_ID) {
    return title || promptLabel || untitled
  }
  const video = title || untitled
  return P.isTruthy(promptLabel) ? `${promptLabel} · ${video}` : video
}

/** Sort and group history using an explicit calendar.
 * @example groupAgentHistory({items:[],now:0,locale:'en',calendar})
 * @category rules
 * @since 0.0.0
 */
export function groupAgentHistory<
  T extends {
    id: string
    updatedAt: number
  }
>(): (input: {
  items: T[]
  now: number
  locale: string
  calendar: AgentHistoryCalendar
}) => AgentHistoryGroup<T>[]
/** groupAgentHistory shared contract.
 * @category utilities
 * @since 0.0.0
 * @example groupAgentHistory
 */
export function groupAgentHistory<
  T extends {
    id: string
    updatedAt: number
  }
>(input: {
  items: T[]
  now: number
  locale: string
  calendar: AgentHistoryCalendar
}): AgentHistoryGroup<T>[]
/** groupAgentHistory shared contract.
 * @category utilities
 * @since 0.0.0
 * @example groupAgentHistory
 */
export function groupAgentHistory<
  T extends {
    id: string
    updatedAt: number
  }
>(input?: { items: T[]; now: number; locale: string; calendar: AgentHistoryCalendar }) {
  const apply = (value: {
    items: T[]
    now: number
    locale: string
    calendar: AgentHistoryCalendar
  }) => groupAgentHistoryBody(value.items, value.now, value.locale, value.calendar)
  return input === undefined ? apply : apply(input)
}

/** Record contract for agentConversationTitle.
 * @category ports
 * @since 0.0.0
 * @example AgentConversationTitleInput
 */
export interface AgentConversationTitleInput {
  thread: AgentThread
  videoTitle: string
}
/** agentConversationTitle with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example agentConversationTitle
 */
export const agentConversationTitle: {
  (): (input: AgentConversationTitleInput) => string
  (input: AgentConversationTitleInput): string
} = recordFunction((input: AgentConversationTitleInput): string =>
  agentConversationTitleBody(input.thread, input.videoTitle)
)
/** Record contract for agentHistoryDisplayTitle.
 * @category ports
 * @since 0.0.0
 * @example AgentHistoryDisplayTitleInput
 */
export interface AgentHistoryDisplayTitleInput {
  item: AgentThreadSummary
  untitled: string
  promptLabel: string
}
/** agentHistoryDisplayTitle with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example agentHistoryDisplayTitle
 */
export const agentHistoryDisplayTitle: {
  (): (input: AgentHistoryDisplayTitleInput) => string
  (input: AgentHistoryDisplayTitleInput): string
} = recordFunction((input: AgentHistoryDisplayTitleInput): string =>
  agentHistoryDisplayTitleBody(input.item, input.untitled, input.promptLabel)
)
