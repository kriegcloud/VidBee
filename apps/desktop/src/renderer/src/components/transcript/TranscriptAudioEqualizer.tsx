import { cn } from '@renderer/lib/utils'
import type { ReactNode } from 'react'

interface TranscriptAudioEqualizerProps {
  className?: string
  playing: boolean
}

/**
 * Compact bars that pulse while the current item is playing.
 */
export function TranscriptAudioEqualizer({
  className,
  playing
}: TranscriptAudioEqualizerProps): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn('transcript-audio-eq', playing && 'transcript-audio-eq--playing', className)}
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
