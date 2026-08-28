import { parseThinkingSteps } from '@shared/ai-thinking'
import {
  ThinkingStep,
  ThinkingSteps,
  ThinkingStepsContent,
  ThinkingStepsHeader
} from '@vidbee/ui/components/ui/thinking-steps'
import { useTranslation } from 'react-i18next'

interface TranscriptPromptThinkingProps {
  running: boolean
  thinking: string
  thinkingMs: number
}

interface ThinkingRow {
  description?: string
  isLast: boolean
  label: string
  status: 'active' | 'complete'
}

/**
 * Build the step rows shown while a prompt is thinking or after it finishes.
 *
 * @param thinking Raw reasoning text from the model.
 * @param running Whether the run is still streaming.
 * @param writingLabel Placeholder label used before any thinking arrives.
 */
const thinkingRows = (thinking: string, running: boolean, writingLabel: string): ThinkingRow[] => {
  const parsed = parseThinkingSteps(thinking)
  if (parsed.length === 0) {
    if (!running) {
      return []
    }
    return [{ isLast: true, label: writingLabel, status: 'active' }]
  }
  return parsed.map((step, index) => ({
    description: step.description,
    isLast: index === parsed.length - 1,
    label: step.label,
    status: running && index === parsed.length - 1 ? 'active' : 'complete'
  }))
}

/**
 * Render model reasoning as collapsible steps instead of raw Streamdown.
 *
 * @param props Live thinking text, its duration, and whether the run streams.
 */
export function TranscriptPromptThinking({
  running,
  thinking,
  thinkingMs
}: TranscriptPromptThinkingProps) {
  const { t } = useTranslation()
  const rows = thinkingRows(thinking, running, t('transcript.promptRunning'))
  if (rows.length === 0) {
    return null
  }

  // Runs recorded before the duration was tracked keep the plain label rather
  // than claiming zero seconds.
  const seconds = Math.max(1, Math.round(thinkingMs / 1000))
  let header = t('transcript.promptThinking')
  if (thinkingMs > 0) {
    header = running
      ? t('transcript.promptThinkingFor', { seconds })
      : t('transcript.promptThoughtFor', { seconds })
  }

  return (
    <ThinkingSteps
      className="w-full font-sans"
      defaultOpen={running}
      key={running ? 'running' : 'done'}
    >
      <ThinkingStepsHeader icon="brain">{header}</ThinkingStepsHeader>
      <ThinkingStepsContent>
        {rows.map((row, index) => (
          <ThinkingStep
            description={row.description}
            isLast={row.isLast}
            key={`${String(index)}:${row.label}`}
            label={row.label}
            showIcon={false}
            status={row.status}
          />
        ))}
      </ThinkingStepsContent>
    </ThinkingSteps>
  )
}
