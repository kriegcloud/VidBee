import type { YtDlpKernelStatus } from '@shared/types'
import { useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import { getDesktopDocument } from '../legacy/document'
import { foundationClients, foundationEvents } from '../lib/foundation'
import { projectFoundationAtom } from '../lib/foundation-state'
import { logger } from '../lib/logger'

export const initialYtDlpKernelStatus: YtDlpKernelStatus = {
  error: null,
  nodeVersion: null,
  preparationStep: 'copying',
  progress: 0,
  ready: false,
  source: null,
  state: 'preparing',
  ytDlpVersion: null
}

export const ytdlpKernelStatusAtom = projectFoundationAtom(getDesktopDocument().atoms.kernel)

/**
 * Subscribe to kernel state before loading its snapshot and expose fatal retry.
 */
export function useYtDlpKernelStatus(): {
  retry: () => Promise<void>
  status: YtDlpKernelStatus
} {
  const [status, setStatus] = useAtom(ytdlpKernelStatusAtom)

  useEffect(() => {
    let disposed = false
    let receivedLiveStatus = false

    /**
     * Store a trusted main-process kernel status event.
     */
    const handleStatus = (rawStatus: unknown): void => {
      receivedLiveStatus = true
      setStatus(rawStatus as YtDlpKernelStatus)
    }
    const listener = foundationEvents.on('ytdlp-kernel:status', handleStatus)
    void foundationClients.app
      .getYtDlpKernelStatus()
      .then((snapshot) => {
        if (!(disposed || receivedLiveStatus)) {
          setStatus(snapshot)
        }
      })
      .catch((error) => logger.error('Failed to load yt-dlp kernel status:', error))

    return () => {
      disposed = true
      foundationEvents.removeListener('ytdlp-kernel:status', listener)
    }
  }, [setStatus])

  /**
   * Retry local preparation and immediately store the returned snapshot.
   */
  const retry = useCallback(async (): Promise<void> => {
    const nextStatus = await foundationClients.app.retryYtDlpKernelPreparation()
    setStatus(nextStatus)
  }, [setStatus])

  return { retry, status }
}
