import { Badge } from '@renderer/components/ui/badge'
import type { YtDlpKernelStatus } from '@shared/types'
import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DownloadEngineRowProps {
  status: YtDlpKernelStatus
}

/**
 * Display the active yt-dlp and Node bundle without exposing update controls.
 */
export function DownloadEngineRow({ status }: DownloadEngineRowProps) {
  const { t } = useTranslation()
  const isActive = status.state === 'checking' || status.state === 'installing'
  const statusClassName =
    status.state === 'unavailable'
      ? 'text-destructive'
      : status.state === 'bundled-fallback' || status.state === 'retry-scheduled'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-muted-foreground'

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="space-y-1">
        <p className="font-medium leading-none">{t('about.downloadEngine.title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('about.downloadEngine.versions', {
            nodeVersion: status.nodeVersion ?? '—',
            ytDlpVersion: status.ytDlpVersion ?? '—'
          })}
        </p>
      </div>
      <Badge
        aria-live="polite"
        className={`gap-1.5 ${statusClassName}`}
        role={isActive ? 'status' : undefined}
        variant="outline"
      >
        {isActive ? (
          <LoaderCircle
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
          />
        ) : null}
        {t(`about.downloadEngine.status.${status.state}`)}
      </Badge>
    </div>
  )
}
