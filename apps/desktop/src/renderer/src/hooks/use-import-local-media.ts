import type { DownloadHistoryItem } from '@shared/types'
import { useNavigate } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ipcServices } from '../lib/ipc'
import { logger } from '../lib/logger'
import { pickAndImportLocalMedia } from '../lib/pick-local-media'
import { addHistoryRecordAtom } from '../store/downloads'
import { loadTranscriptMapAtom } from '../store/transcripts'

interface ImportedLocalMedia {
  downloadId: string
  historyItem: DownloadHistoryItem
}

interface ImportLocalMediaResult {
  imported: ImportedLocalMedia[]
  rejected: Array<{ path: string; reason: string }>
}

/**
 * Apply a local-media import result to the download list, transcripts, and route.
 */
export const useImportLocalMedia = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const addHistoryRecord = useSetAtom(addHistoryRecordAtom)
  const loadTranscripts = useSetAtom(loadTranscriptMapAtom)

  const applyImportResult = useCallback(
    async (result: ImportLocalMediaResult, options?: { navigate?: boolean }) => {
      for (const item of result.imported) {
        addHistoryRecord(item.historyItem)
      }
      if (result.imported.length > 0) {
        await loadTranscripts()
        const firstId = result.imported[0]?.downloadId
        if (options?.navigate !== false && firstId) {
          await navigate({
            to: '/downloads/$downloadId/transcript',
            params: { downloadId: firstId }
          })
        }
        toast.success(
          result.imported.length === 1
            ? t('notifications.transcriptionStarted')
            : t('notifications.transcriptionStartedMany', { count: result.imported.length })
        )
      }
      if (result.rejected.length > 0 && result.imported.length === 0) {
        toast.error(t('notifications.unsupportedDrop'))
      }
    },
    [addHistoryRecord, loadTranscripts, navigate, t]
  )

  const importMediaPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return
      }
      try {
        const result = (await ipcServices.transcript.importLocal({
          paths
        })) as ImportLocalMediaResult
        await applyImportResult(result)
      } catch (error) {
        logger.error('Failed to import local media:', error)
        toast.error(t('notifications.transcriptionStartFailed'))
      }
    },
    [applyImportResult, t]
  )

  /**
   * Open the native media picker and start transcription for the chosen files.
   */
  const pickAndImportMedia = useCallback(async () => {
    try {
      await pickAndImportLocalMedia({
        importMediaPaths,
        selectMediaFiles: () => ipcServices.fs.selectMediaFiles()
      })
    } catch (error) {
      logger.error('Failed to pick local media:', error)
      toast.error(t('notifications.transcriptionStartFailed'))
    }
  }, [importMediaPaths, t])

  return { applyImportResult, importMediaPaths, pickAndImportMedia }
}
