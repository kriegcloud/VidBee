interface DoubleClickHistoryTarget {
  entryType: 'active' | 'history'
  fileExists: boolean
  status?: string
}

interface TranscriptMenuTarget {
  fileExists: boolean
}

/**
 * Decide whether a history row should open the saved file on double click for issue #154.
 */
export const shouldOpenHistoryItemOnDoubleClick = ({
  entryType,
  fileExists,
  status
}: DoubleClickHistoryTarget): boolean => {
  return entryType === 'history' && fileExists && status === 'completed'
}

/**
 * Retry is offered for failed and cancelled rows. Cancelled uses the same X
 * status mark users often read as a failure, so it must be retryable too.
 */
export const canRetryDownload = (status?: string): boolean =>
  status === 'error' || status === 'cancelled'

/**
 * Open the transcript page for a finished download that still has a file.
 * Captions vs ASR is decided on the transcript page, not on this row.
 *
 * @param target Download file presence.
 */
export const canViewTranscriptFromMenu = ({ fileExists }: TranscriptMenuTarget): boolean =>
  fileExists
