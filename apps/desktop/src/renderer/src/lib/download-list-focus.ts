/**
 * The row the history list should return to after a detail page.
 * Module state, so it survives the list unmounting during navigation.
 */
let pendingFocusId: string | null = null

/** Remember the row a detail page was opened from. */
export const rememberDownloadListFocus = (downloadId: string): void => {
  pendingFocusId = downloadId
}

/** Read and clear the pending row, so a later visit starts at the top again. */
export const takeDownloadListFocus = (): string | null => {
  const downloadId = pendingFocusId
  pendingFocusId = null
  return downloadId
}
