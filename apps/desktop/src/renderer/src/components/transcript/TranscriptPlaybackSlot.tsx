import { parkPlaybackPlayer } from '@renderer/lib/transcript-playback'
import { cn } from '@renderer/lib/utils'
import { type PlaybackSlotId, setPlaybackSlotAtom } from '@renderer/store/transcript-playback'
import { useSetAtom } from 'jotai'
import { type ReactNode, useLayoutEffect, useRef } from 'react'

interface TranscriptPlaybackSlotProps {
  className?: string
  slot: PlaybackSlotId
}

/**
 * Register a live mount point for the shared transcript player node.
 */
export function TranscriptPlaybackSlot({
  className,
  slot
}: TranscriptPlaybackSlotProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const setSlot = useSetAtom(setPlaybackSlotAtom)
  useLayoutEffect(() => {
    const el = ref.current
    setSlot({ el, slot })
    return () => {
      parkPlaybackPlayer()
      setSlot({ el: null, expected: el, slot })
    }
  }, [setSlot, slot])

  return (
    <div className={cn('h-full min-h-0 w-full', className)} data-playback-slot={slot} ref={ref} />
  )
}
