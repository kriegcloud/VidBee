import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { idlePromptRunSnapshot } from '@shared/ai-run'
import type { AiPromptRunSnapshot } from '@shared/ai-types'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Subscribe to a main-process prompt run so navigating away does not abort it.
 *
 * @param downloadId Download or settings-test id.
 * @param promptId Prompt id, or null when no prompt is selected.
 */
export const usePromptRun = (
  downloadId: string,
  promptId: string | null
): {
  hydrated: boolean
  run: AiPromptRunSnapshot
  start: (transcriptText: string) => Promise<void>
  stop: () => Promise<void>
} => {
  const { i18n } = useTranslation()
  const [run, setRun] = useState<AiPromptRunSnapshot>(() =>
    idlePromptRunSnapshot(downloadId, promptId ?? '')
  )
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!promptId) {
      setRun(idlePromptRunSnapshot(downloadId, ''))
      setHydrated(true)
      return
    }
    let cancelled = false
    setHydrated(false)
    void ipcServices.ai
      .getPromptRun({ downloadId, promptId })
      .then((snapshot) => {
        if (!cancelled) {
          setRun(snapshot)
          setHydrated(true)
        }
      })
      .catch((error) => {
        logger.error('Failed to load prompt run', error)
        if (!cancelled) {
          setHydrated(true)
        }
      })
    const off = ipcEvents.on('ai:prompt-run', (...args: unknown[]) => {
      const snapshot = args[0] as AiPromptRunSnapshot
      if (snapshot?.downloadId === downloadId && snapshot.promptId === promptId) {
        setRun(snapshot)
      }
    })
    return () => {
      cancelled = true
      ipcEvents.removeListener('ai:prompt-run', off as (...args: unknown[]) => void)
    }
  }, [downloadId, promptId])

  /**
   * Start or restart the prompt against the enabled provider.
   *
   * @param transcriptText Transcript or sample text.
   */
  const start = useCallback(
    async (transcriptText: string): Promise<void> => {
      if (!promptId) {
        return
      }
      try {
        const snapshot = await ipcServices.ai.startPrompt({
          downloadId,
          promptId,
          transcriptText,
          uiLanguage: i18n.language
        })
        setRun(snapshot)
      } catch (error) {
        logger.error('Failed to start prompt run', error)
        setRun({
          downloadId,
          promptId,
          status: 'error',
          text: '',
          thinking: '',
          thinkingMs: 0,
          error: error instanceof Error ? error.message : 'Prompt failed',
          errorCode: 'unknown',
          updatedAt: Date.now()
        })
      }
    },
    [downloadId, i18n.language, promptId]
  )

  /**
   * Abort the in-flight stream without leaving the page.
   */
  const stop = useCallback(async (): Promise<void> => {
    if (!promptId) {
      return
    }
    try {
      setRun(await ipcServices.ai.stopPrompt({ downloadId, promptId }))
    } catch (error) {
      logger.error('Failed to stop prompt run', error)
    }
  }, [downloadId, promptId])

  return { hydrated, run, start, stop }
}
