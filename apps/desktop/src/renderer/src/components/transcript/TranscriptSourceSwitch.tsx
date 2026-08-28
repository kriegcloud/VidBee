import { languageDisplayName } from '@renderer/components/transcript/TranscriptInfoPane'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { TranscriptSnapshotView } from '@renderer/store/transcripts'
import { useTranslation } from 'react-i18next'

type TranscriptSource = NonNullable<TranscriptSnapshotView['sources']>[number]

/**
 * Localized label for one captions-language or ASR source.
 *
 * @param source Source option from the host.
 * @param t i18n translate.
 * @param locale UI locale.
 */
export const transcriptSourceLabel = (
  source: TranscriptSource,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): string => {
  if (source.kind === 'asr') {
    return t('transcript.sourceAi')
  }
  const language = languageDisplayName(source.languageCode || source.language || 'und', locale)
  return source.auto
    ? t('transcript.sourceCaptionAutoNamed', { language })
    : t('transcript.sourceCaptionNamed', { language })
}

interface TranscriptSourceSwitchProps {
  disabled?: boolean
  onSelect: (key: string) => void
  sources: TranscriptSource[]
}

/**
 * Switch the visible transcript between caption tracks and local ASR.
 */
export function TranscriptSourceSwitch({
  disabled,
  onSelect,
  sources
}: TranscriptSourceSwitchProps) {
  const { t, i18n } = useTranslation()
  const selected = sources.find((source) => source.selected) ?? sources[0]
  if (!selected || sources.length < 2) {
    return null
  }
  return (
    <Select disabled={disabled} onValueChange={onSelect} value={selected.key}>
      <SelectTrigger
        aria-label={t('transcript.sourceSwitch')}
        className="h-8 w-auto min-w-36 max-w-52 gap-1 px-2 text-xs"
      >
        <SelectValue>{transcriptSourceLabel(selected, t, i18n.language)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {sources.map((source) => (
          <SelectItem key={source.key} value={source.key}>
            {transcriptSourceLabel(source, t, i18n.language)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
