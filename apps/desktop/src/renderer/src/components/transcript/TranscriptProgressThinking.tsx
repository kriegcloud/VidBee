import { collapseTimedStages, formatElapsedClock } from '@renderer/lib/transcript-library'
import {
  ThinkingStep,
  ThinkingSteps,
  ThinkingStepsContent,
  ThinkingStepsHeader
} from '@vidbee/ui/components/ui/thinking-steps'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TranscriptProgressThinkingProps {
  /** Download this run belongs to, used to remember collapse across remounts. */
  downloadId?: string
  running: boolean
  runningLabel: string
  stage?: string | null
  stageHistory?: Array<{ stage: string; startedAt: number }>
}

/**
 * localStorage key for this download's thinking-step open/collapsed state.
 *
 * @param downloadId Host download id.
 */
export const transcriptProgressThinkingStorageKey = (downloadId: string): string =>
  `vidbee:transcript-progress-thinking:${downloadId}`

const TICK_MS = 1000

/**
 * Show ASR pipeline stages as thinking steps while a transcript is running.
 *
 * @param props Live stage, persisted timings, and whether work is still in flight.
 */
export function TranscriptProgressThinking({
  downloadId,
  running,
  runningLabel,
  stage,
  stageHistory = []
}: TranscriptProgressThinkingProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const fallbackStartedAt = useRef(Date.now())
  useEffect(() => {
    if (!running) {
      fallbackStartedAt.current = Date.now()
      return
    }
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, TICK_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [running])

  if (!running) {
    return null
  }

  const history =
    stageHistory.length > 0
      ? stageHistory
      : [
          {
            stage: stage?.trim() || 'preparing-audio',
            startedAt: fallbackStartedAt.current
          }
        ]
  const rows = collapseTimedStages(history, now)
  const startedAt = rows[0]?.startedAt ?? now
  const current = rows.at(-1)
  const currentLabel = current ? t(current.labelKey) : runningLabel
  const totalLabel = `${currentLabel} · ${formatElapsedClock(now - startedAt)}`
  return (
    <ThinkingSteps
      className="w-full px-4 pt-4 font-sans"
      defaultOpen
      size="compact"
      storageKey={downloadId ? transcriptProgressThinkingStorageKey(downloadId) : undefined}
    >
      <ThinkingStepsHeader icon="loader">{totalLabel}</ThinkingStepsHeader>
      <ThinkingStepsContent>
        {rows.map((row, index) => (
          <ThinkingStep
            description={formatElapsedClock(row.endedAt - row.startedAt)}
            isLast={index === rows.length - 1}
            key={row.id}
            label={t(row.labelKey)}
            showIcon={false}
            status={row.status}
          />
        ))}
      </ThinkingStepsContent>
    </ThinkingSteps>
  )
}
