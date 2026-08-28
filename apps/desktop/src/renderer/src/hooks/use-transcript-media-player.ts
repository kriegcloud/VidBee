import { ipcServices } from '@renderer/lib/ipc'
import type { PlayerAttachResult } from '@shared/types/player'
import { isNativelyPlayableAudio } from '@shared/utils/native-playable'
import { useCallback, useEffect, useState } from 'react'

interface UseTranscriptMediaPlayerInput {
  filePath: string | null
}

interface UseTranscriptMediaPlayerResult {
  error: string | null
  playablePath: string | null
  retry: () => void
}

/**
 * Prepare a Chromium-playable local path for the in-page Video.js player.
 */
export const useTranscriptMediaPlayer = ({
  filePath
}: UseTranscriptMediaPlayerInput): UseTranscriptMediaPlayerResult => {
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [playablePath, setPlayablePath] = useState<string | null>(null)

  const retry = useCallback(() => {
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    setError(null)
    if (!filePath || attempt < 0) {
      setPlayablePath(null)
      void ipcServices.player.detach()
      return
    }
    if (isNativelyPlayableAudio(filePath)) {
      setPlayablePath(filePath)
      void ipcServices.player.detach()
      return
    }
    setPlayablePath(null)
    let cancelled = false
    void ipcServices.player
      .attach({ filePath })
      .then((result: PlayerAttachResult) => {
        if (cancelled) {
          return
        }
        setPlayablePath(result.playablePath)
        setError(result.reason ?? null)
      })
      .catch((attachError: unknown) => {
        if (cancelled) {
          return
        }
        setPlayablePath(null)
        setError(attachError instanceof Error ? attachError.message : String(attachError))
      })
    return () => {
      cancelled = true
      void ipcServices.player.detach()
    }
  }, [attempt, filePath])

  useEffect(() => {
    const onPageHide = (): void => {
      void ipcServices.player.detach()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  return { error, playablePath, retry }
}
