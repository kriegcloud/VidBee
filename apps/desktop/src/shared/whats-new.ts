import * as HashSet from 'effect/HashSet'
import * as Str from 'effect/String'

/** Release id for the current What's New card. Bump when the next set of features ships.  * @example WHATS_NEW_ID
 * @category utilities
 * @since 0.0.0
 */
export const WHATS_NEW_ID = 'ai-transcripts'

/** Feature rows shown in the What's New dialog, in display order.  * @example WHATS_NEW_FEATURE_IDS
 * @category utilities
 * @since 0.0.0
 */
export const WHATS_NEW_FEATURE_IDS = ['transcript', 'speakers', 'summary', 'localFiles'] as const

/** WhatsNewFeatureId shared contract.
 * @category utilities
 * @since 0.0.0
 * @example WhatsNewFeatureId
 */
export type WhatsNewFeatureId = (typeof WHATS_NEW_FEATURE_IDS)[number]

/**
 * Decide whether a returning user should see the What's New dialog.
 *
 * New installs have no prior settings file and skip the card. Later feature
 * sets still show when `lastSeenWhatsNew` is an older id.
 *
 * @param lastSeenWhatsNew Stored release id, empty when never recorded.
 * @param isReturningUser True when a settings file already existed at launch.
 * @param currentId Release id to compare against. Defaults to `WHATS_NEW_ID`.
 * @example shouldShowWhatsNew
 * @category utilities
 * @since 0.0.0
 */
export const shouldShowWhatsNew = ({
  lastSeenWhatsNew,
  isReturningUser,
  currentId = WHATS_NEW_ID
}: {
  currentId?: string
  isReturningUser: boolean
  lastSeenWhatsNew: string | null | undefined
}): boolean => {
  const lastSeen =
    lastSeenWhatsNew === null || lastSeenWhatsNew === undefined ? '' : Str.trim(lastSeenWhatsNew)
  if (lastSeen === currentId) {
    return false
  }
  if (!(Boolean(lastSeen) || isReturningUser)) {
    return false
  }
  return true
}

const IN_PROGRESS_STATES = HashSet.fromIterable(['queued', 'retry-scheduled', 'running'])

/**
 * Pick a transcript detail to open from What's New: a finished transcript first,
 * otherwise one that is still generating.
 *
 * @param snapshots Transcript rows currently on this computer.
 * @returns A download id, or null when nothing useful is available.
 * @example pickWhatsNewTranscriptId
 * @category utilities
 * @since 0.0.0
 */
export const pickWhatsNewTranscriptId = (
  snapshots: Array<{
    downloadTaskId: string
    listState: string
    updatedAt?: number
  }>
): string | null => {
  const newestId = (items: Array<{ downloadTaskId: string; updatedAt?: number }>): string | null =>
    [...items].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
      ?.downloadTaskId ?? null

  const completed: Array<{ downloadTaskId: string; updatedAt?: number }> = []
  const pending: Array<{ downloadTaskId: string; updatedAt?: number }> = []
  for (const [index, snapshot] of snapshots.entries()) {
    if (!(index in snapshots)) {
      continue
    }
    const hasDownloadId = Boolean(snapshot.downloadTaskId)
    if (!hasDownloadId) {
      continue
    }
    if (snapshot.listState === 'completed') {
      completed.push(snapshot)
    }
    if (HashSet.has(IN_PROGRESS_STATES, snapshot.listState)) {
      pending.push(snapshot)
    }
  }
  const completedId = newestId(completed)
  const hasCompletedId = Boolean(completedId)
  if (hasCompletedId) {
    return completedId
  }

  return newestId(pending)
}
