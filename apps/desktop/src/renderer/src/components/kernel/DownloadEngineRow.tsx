import { Badge } from '@renderer/components/ui/badge'
import type { YtDlpKernelStatus } from '@shared/types'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface DownloadEngineRowProps {
  status: YtDlpKernelStatus
  actions?: ReactNode
}

/**
 * Display the active yt-dlp and Node bundle without exposing update controls.
 * @param props.status Current download-engine readiness and versions
 * @param props.actions Optional trailing actions, such as release notes
 */
export function DownloadEngineRow({ status, actions }: DownloadEngineRowProps) {
  const { t } = useTranslation()
  const isActive = status.state === 'checking' || status.state === 'installing'
  const statusClassName =
    status.state === 'unavailable'
      ? 'bg-destructive/10 text-destructive'
      : status.state === 'bundled-fallback' || status.state === 'retry-scheduled'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
        : 'bg-muted text-muted-foreground'

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="space-y-1">
        <p className="font-medium text-sm">{t('about.downloadEngine.title')}</p>
        <p className="text-muted-foreground text-sm tabular-nums">
          {t('about.downloadEngine.versions', {
            nodeVersion: status.nodeVersion ?? '—',
            ytDlpVersion: status.ytDlpVersion ?? '—'
          })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          aria-live="polite"
          className={`shrink-0 rounded-full border-0 px-2 py-1 font-medium text-xs ${statusClassName}`}
          role={isActive ? 'status' : undefined}
          variant="secondary"
        >
          {isActive ? (
            <LoaderCircle
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {t(`about.downloadEngine.status.${status.state}`)}
        </Badge>
        {actions}
      </div>
    </div>
  )
}
