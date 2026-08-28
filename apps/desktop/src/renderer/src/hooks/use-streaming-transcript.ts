import { prefersReducedMotion } from '@renderer/lib/transcript-follow'
import {
  nextRevealedLength,
  revealSegment,
  STREAM_TICK_MS,
  transcriptCharCount
} from '@renderer/lib/transcript-stream'
import type { TranscriptSegmentView } from '@renderer/store/transcripts'
import { useEffect, useState } from 'react'

export interface StreamingTranscriptView {
  segments: TranscriptSegmentView[]
  streaming: boolean
  streamingId: string | null
}

/**
 * Reveal incoming transcript rows with a typewriter so ASR chunks feel live.
 */
export const useStreamingTranscript = (
  segments: TranscriptSegmentView[],
  enabled: boolean
): StreamingTranscriptView => {
  const last = segments.at(-1) ?? null
  const lastId = last?.id ?? null
  const target = last ? transcriptCharCount(last.text) : 0
  const instant = !enabled || prefersReducedMotion()
  const [activeId, setActiveId] = useState<string | null>(lastId)
  const [revealed, setRevealed] = useState(() => (instant ? target : 0))

  useEffect(() => {
    if (lastId === activeId) {
      return
    }
    setActiveId(lastId)
    setRevealed(instant ? target : 0)
  }, [activeId, instant, lastId, target])

  useEffect(() => {
    if (instant || !lastId || revealed >= target) {
      return
    }
    const timer = window.setInterval(() => {
      setRevealed((current) => nextRevealedLength(current, target))
    }, STREAM_TICK_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [instant, lastId, revealed, target])

  if (!(enabled && last)) {
    return { segments, streaming: false, streamingId: null }
  }

  const visibleChars = instant ? target : lastId === activeId ? revealed : 0
  return {
    segments: [...segments.slice(0, -1), revealSegment(last, visibleChars)],
    streaming: visibleChars < target,
    streamingId: last.id
  }
}
