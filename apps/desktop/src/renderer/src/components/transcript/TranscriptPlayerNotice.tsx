import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { ReactNode } from 'react'

interface TranscriptPlayerNoticeProps {
  detail?: string | null
  onRetry?: () => void
  retryLabel?: string
  title: string
  variant?: 'audio' | 'video'
}

/**
 * Show a full-frame playback status instead of a raw Video.js error dialog.
 */
export function TranscriptPlayerNotice({
  detail,
  onRetry,
  retryLabel,
  title,
  variant = 'video'
}: TranscriptPlayerNoticeProps): ReactNode {
  const isAudio = variant === 'audio'
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center px-6 text-center',
        isAudio ? 'min-h-36 flex-1' : 'h-full min-h-0 bg-black'
      )}
    >
      <div className="max-w-sm space-y-3">
        <p className={cn('font-medium', isAudio ? 'text-foreground' : 'text-white')}>{title}</p>
        {detail ? (
          <p className={cn('text-sm', isAudio ? 'text-muted-foreground' : 'text-white/70')}>
            {detail}
          </p>
        ) : null}
        {onRetry && retryLabel ? (
          <Button onClick={onRetry} type="button" variant="secondary">
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
