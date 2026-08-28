import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from './input'
import { Label } from './label'

interface TimeRangeOptionsProps {
  endTime: string
  onEndTimeChange: (value: string) => void
  onStartTimeChange: (value: string) => void
  startTime: string
}

/** Render a compact start/end clip row shared by Desktop and Web. */
export function TimeRangeOptions({
  endTime,
  onEndTimeChange,
  onStartTimeChange,
  startTime
}: TimeRangeOptionsProps) {
  const { t } = useTranslation()
  const fieldId = useId()
  const startId = `${fieldId}-start`
  const endId = `${fieldId}-end`

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{t('advancedOptions.timeRange')}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1">
          <Label className="font-medium text-muted-foreground text-xs" htmlFor={startId}>
            {t('advancedOptions.start')}
          </Label>
          <Input
            autoComplete="off"
            className="h-7 min-w-0 text-xs tabular-nums"
            id={startId}
            onChange={(event) => onStartTimeChange(event.target.value)}
            placeholder={t('advancedOptions.startPlaceholder')}
            title={t('advancedOptions.startHint')}
            value={startTime}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="font-medium text-muted-foreground text-xs" htmlFor={endId}>
            {t('advancedOptions.end')}
          </Label>
          <Input
            autoComplete="off"
            className="h-7 min-w-0 text-xs tabular-nums"
            id={endId}
            onChange={(event) => onEndTimeChange(event.target.value)}
            placeholder={t('advancedOptions.endPlaceholder')}
            title={t('advancedOptions.endHint')}
            value={endTime}
          />
        </div>
      </div>
    </fieldset>
  )
}
