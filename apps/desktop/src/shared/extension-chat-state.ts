import * as P from 'effect/Predicate'
import * as Sparse from './ArrayHelpers.js'
import { applyAgentRunEvent } from './agent-thread-patch'
import type { ExtensionChatEvent, ExtensionChatState } from './extension-chat'
import { recordFunction } from './RecordFunction.js'

/** Apply the same ordered thread patches as Desktop without polling conversation snapshots.  * @example ExtensionChatEventInput
 * @category utilities
 * @since 0.0.0
 */
export interface ExtensionChatEventInput {
  readonly current: ExtensionChatState
  readonly incoming: ExtensionChatEvent
}
/** applyExtensionChatEvent shared contract.
 * @category utilities
 * @since 0.0.0
 * @example applyExtensionChatEvent
 */
export const applyExtensionChatEvent: {
  (): (input: ExtensionChatEventInput) => {
    state: ExtensionChatState
    gap: boolean
  }
  (
    input: ExtensionChatEventInput
  ): {
    state: ExtensionChatState
    gap: boolean
  }
} = recordFunction(
  ({
    current,
    incoming
  }: ExtensionChatEventInput): {
    state: ExtensionChatState
    gap: boolean
  } => {
    if (incoming.type === 'snapshot') {
      return {
        state: incoming.state,
        gap: false
      }
    }
    if (incoming.type !== 'agent') {
      return {
        state: current,
        gap: false
      }
    }
    const { event } = incoming
    let next = current
    const notice = event.catalog
    if (notice !== undefined && notice.revision > current.revision) {
      const id = notice.kind === 'remove' ? notice.id : notice.summary.id
      const threads = Sparse.filter({
        items: current.catalog.threads,
        predicate: (item) => item.id !== id
      })
      const history = Sparse.filter({
        items: current.catalog.history,
        predicate: (item) => item.id !== id
      })
      const statuses = {
        ...current.catalog.statuses
      }
      if (notice.kind === 'upsert') {
        if (notice.summary.downloadId === current.catalog.downloadId) {
          threads.push(notice.summary)
          statuses[notice.summary.promptId] = {
            status: notice.runStatus,
            updatedAt: notice.statusUpdatedAt
          }
        }
        if (P.isTruthy(notice.history)) {
          history.push(notice.summary)
        }
      }
      next = {
        ...current,
        revision: notice.revision,
        catalog: {
          ...current.catalog,
          threads: threads.sort((a, b) => b.updatedAt - a.updatedAt),
          history: history.sort((a, b) => b.updatedAt - a.updatedAt),
          statuses,
          sources:
            incoming.source === undefined
              ? current.catalog.sources
              : {
                  ...current.catalog.sources,
                  [incoming.source.downloadId]: incoming.source
                }
        }
      }
    }
    if (event.type === 'thread.deleted' && event.threadId === next.thread?.id) {
      return {
        state: {
          ...next,
          thread: null
        },
        gap: false
      }
    }
    const thread = next.thread
    if (thread === null || !P.isTruthy(thread) || event.threadId !== thread.id) {
      return {
        state: next,
        gap: false
      }
    }
    const result = applyAgentRunEvent({
      current: thread,
      event,
      identity: {
        downloadId: thread.downloadId,
        promptId: thread.promptId,
        threadId: thread.id
      }
    })
    return {
      state:
        result.kind === 'applied'
          ? {
              ...next,
              thread: result.thread
            }
          : next,
      gap: result.kind === 'gap'
    }
  }
)
