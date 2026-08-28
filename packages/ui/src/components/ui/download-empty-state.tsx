import { History as HistoryIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface DownloadEmptyStateProps {
  message: string
  hint?: string
  className?: string
  action?: ReactNode
}

/**
 * Empty download list placeholder with an optional ingest hint.
 */
export const DownloadEmptyState = ({
  action,
  message,
  hint,
  className
}: DownloadEmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 border-dashed px-6 py-10 text-center text-muted-foreground',
        className
      )}
    >
      <HistoryIcon className="h-10 w-10 opacity-50" />
      <p className="font-medium text-sm">{message}</p>
      {hint ? <p className="max-w-md text-muted-foreground/80 text-xs">{hint}</p> : null}
      {action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  )
}
