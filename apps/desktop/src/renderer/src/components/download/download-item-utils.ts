import type { DownloadRecord } from '@renderer/store/downloads'

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

/**
 * Drop empty or placeholder codec names from format metadata.
 */
const sanitizeCodec = (codec?: string | null): string | undefined => {
  if (!codec || codec === 'none') {
    return undefined
  }
  return codec
}

/**
 * Container label for a saved download, from the selected format or file name.
 */
export const getFormatLabel = (download: DownloadRecord): string | undefined => {
  if (download.selectedFormat?.ext) {
    return download.selectedFormat.ext.toUpperCase()
  }
  const savedName = download.savedFileName
  if (!savedName?.includes('.')) {
    return undefined
  }
  const ext = savedName.split('.').pop()?.toLowerCase()
  return ext ? ext.toUpperCase() : undefined
}

/**
 * Short quality label for a download row or Info tab (e.g. 1080p, 1080p60).
 */
export const getQualityLabel = (download: DownloadRecord): string | undefined => {
  const format = download.selectedFormat
  if (!format) {
    return undefined
  }
  if (format.height) {
    return `${format.height}p${format.fps === 60 ? '60' : ''}`
  }
  if (format.format_note) {
    return format.format_note
  }
  if (typeof format.quality === 'number') {
    return format.quality.toString()
  }
  return undefined
}

/**
 * Primary codec shown for a download's selected format.
 */
export const getCodecLabel = (download: DownloadRecord): string | undefined => {
  const format = download.selectedFormat
  if (!format) {
    return undefined
  }
  if (download.type === 'audio') {
    return sanitizeCodec(format.acodec)
  }
  return sanitizeCodec(format.vcodec) ?? sanitizeCodec(format.acodec)
}
