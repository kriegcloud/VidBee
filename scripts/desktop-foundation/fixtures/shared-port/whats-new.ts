/** Release id for the current What's New card. Bump when the next set of features ships. */
export const WHATS_NEW_ID = 'ai-transcripts'

/** Feature rows shown in the What's New dialog, in display order. */
export const WHATS_NEW_FEATURE_IDS = ['transcript', 'speakers', 'summary', 'localFiles'] as const

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
  const lastSeen = lastSeenWhatsNew?.trim() ?? ''
  if (lastSeen === currentId) {
    return false
  }
  if (!(lastSeen || isReturningUser)) {
    return false
  }
  return true
}

const IN_PROGRESS_STATES = new Set(['queued', 'retry-scheduled', 'running'])

/**
 * Pick a transcript detail to open from What's New: a finished transcript first,
 * otherwise one that is still generating.
 *
 * @param snapshots Transcript rows currently on this computer.
 * @returns A download id, or null when nothing useful is available.
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

  const completed = snapshots.filter(
    (snapshot) => snapshot.listState === 'completed' && snapshot.downloadTaskId
  )
  const completedId = newestId(completed)
  if (completedId) {
    return completedId
  }

  return newestId(
    snapshots.filter(
      (snapshot) => IN_PROGRESS_STATES.has(snapshot.listState) && snapshot.downloadTaskId
    )
  )
}
