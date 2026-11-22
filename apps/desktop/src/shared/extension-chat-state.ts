import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import * as Order from 'effect/Order'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Sparse from './ArrayHelpers.js'
import { applyAgentRunEvent } from './agent-thread-patch'
import { ExtensionChatEvent, ExtensionChatState } from './extension-chat'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/extension-chat-state')
/** Apply the same ordered thread patches as Desktop without polling conversation snapshots. structural for legacy construction.
 *
 * **Example** (Access the ExtensionChatEventInput contract)
 *
 * ```ts
 * import { ExtensionChatEventInput } from './extension-chat-state.js'
 * void ExtensionChatEventInput
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ExtensionChatEventInput = S.Struct({
  current: ExtensionChatState,
  incoming: ExtensionChatEvent
}).pipe(
  $I.annoteSchema('ExtensionChatEventInput', {
    description:
      'Explicit input record for ExtensionChatEventInput; structural for legacy construction.'
  })
)
/** Schema-derived ExtensionChatEventInput input.
 * @category type-level
 * @since 0.0.0
 */
export type ExtensionChatEventInput = typeof ExtensionChatEventInput.Type
/** applyExtensionChatEvent shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the applyExtensionChatEvent contract)
 *
 * ```ts
 * import { applyExtensionChatEvent } from './extension-chat-state.js'
 * void applyExtensionChatEvent
 * ```
 *
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
          threads: A.sort(
            threads,
            Order.make<(typeof threads)[number]>((a, b) => {
              const difference = b.updatedAt - a.updatedAt
              return difference < 0 ? -1 : difference > 0 ? 1 : 0
            })
          ),
          history: A.sort(
            history,
            Order.make<(typeof history)[number]>((a, b) => {
              const difference = b.updatedAt - a.updatedAt
              return difference < 0 ? -1 : difference > 0 ? 1 : 0
            })
          ),
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
