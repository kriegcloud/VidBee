import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import type { YtDlpKernelStatus } from '@shared/types'
import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { logger } from '../../lib/logger'

interface KernelPreparationScreenProps {
  onRetry: () => Promise<void> | void
  status: YtDlpKernelStatus
}

/**
 * Render the full-window local kernel preparation and recovery state.
 */
export function KernelPreparationScreen({ onRetry, status }: KernelPreparationScreenProps) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)
  const isUnavailable = status.state === 'unavailable'
  const phaseKey = status.preparationStep
    ? `kernelPreparation.${status.preparationStep}`
    : 'kernelPreparation.copying'

  /**
   * Retry preparation while preventing duplicate clicks.
   */
  const handleRetry = async (): Promise<void> => {
    setRetrying(true)
    try {
      await onRetry()
    } catch (error) {
      logger.error('Failed to retry yt-dlp kernel preparation:', error)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 py-8">
      <div
        aria-live={isUnavailable ? 'assertive' : undefined}
        className="flex w-full max-w-xs flex-col items-center text-center"
        role={isUnavailable ? 'alert' : undefined}
      >
        {isUnavailable ? (
          <>
            <AlertCircle aria-hidden="true" className="mb-4 h-10 w-10 text-destructive" />
            <h1 className="font-semibold text-xl tracking-tight">
              {t('kernelPreparation.errorTitle')}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {t('kernelPreparation.errorDescription')}
            </p>
            <Button className="mt-5 min-h-11 min-w-28" disabled={retrying} onClick={handleRetry}>
              {t(retrying ? 'kernelPreparation.retrying' : 'kernelPreparation.retry')}
            </Button>
          </>
        ) : (
          <>
            <img alt="VidBee" className="mb-5 h-14 w-14 rounded-xl" src="./app-icon.png" />
            <output aria-live="polite" className="block">
              <h1 className="font-medium text-base text-foreground">{t(phaseKey)}</h1>
            </output>
            <Progress
              aria-label={t('kernelPreparation.progressLabel')}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={status.progress ?? undefined}
              className="mt-4 h-1.5"
              value={status.progress ?? 0}
            />
          </>
        )}
      </div>
    </div>
  )
}
