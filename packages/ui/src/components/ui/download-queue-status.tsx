import { Button } from './button'
import { Progress } from './progress'

interface DownloadQueueStatusProps {
  active: number
  label: string
  onStopAll: () => void
  percent: number
  stopLabel: string
  stopping?: boolean
}

export function DownloadQueueStatus({
  active,
  label,
  onStopAll,
  percent,
  stopLabel,
  stopping = false
}: DownloadQueueStatusProps) {
  if (active === 0) {
    return null
  }
  return (
    <div className="flex items-center gap-4 border-border border-t pt-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-muted-foreground text-xs">
          {label}
        </p>
        <Progress aria-label={label} className="h-1.5" value={percent} />
      </div>
      <Button disabled={stopping} onClick={onStopAll} size="sm" variant="outline">
        {stopLabel}
      </Button>
    </div>
  )
}
