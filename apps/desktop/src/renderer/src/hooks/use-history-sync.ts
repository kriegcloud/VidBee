import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { ipcServices } from '../lib/ipc'
import { logger } from '../lib/logger'
import { replaceHistoryRecordsAtom } from '../store/downloads'

export function useHistorySync() {
  const replaceHistory = useSetAtom(replaceHistoryRecordsAtom)

  useEffect(() => {
    let cancelled = false
    // Load the full history from the main process in a single store write.
    const loadHistory = async () => {
      try {
        const historyData = await ipcServices.history.getHistory()
        if (!cancelled) {
          replaceHistory(historyData)
        }
      } catch (error) {
        logger.error('Failed to load history:', error)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [replaceHistory])
}
