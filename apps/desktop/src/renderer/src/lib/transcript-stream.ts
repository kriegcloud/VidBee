import type { TranscriptSegmentView, TranscriptSpeakerView } from '@renderer/store/transcripts'

export const STREAM_TICK_MS = 32
export const STREAM_CHARS_PER_TICK = 3
const CATCH_UP_CHARS = 120

export interface PartialTranscriptRow {
  speakerKey: string | null
  startMs: number
  endMs: number
  text: string
  words?: Array<{ text: string; startMs: number; endMs: number }>
  confidence: number | null
}

/**
 * Count Unicode code points so CJK transcripts stream one character at a time.
 */
export const transcriptCharCount = (text: string): number => [...text].length

/**
 * Slice transcript text by Unicode code points.
 */
export const revealTranscriptText = (text: string, revealedChars: number): string => {
  if (revealedChars <= 0) {
    return ''
  }
  const chars = [...text]
  if (revealedChars >= chars.length) {
    return text
  }
  return chars.slice(0, revealedChars).join('')
}

/**
 * Advance the typewriter without falling too far behind a long chunk.
 */
export const nextRevealedLength = (current: number, target: number): number => {
  if (target <= current) {
    return target
  }
  const remaining = target - current
  if (remaining > CATCH_UP_CHARS) {
    return current + Math.ceil(remaining / 4)
  }
  return current + Math.min(STREAM_CHARS_PER_TICK, remaining)
}

/**
 * Truncate a segment so only the already-revealed prefix is visible.
 */
export const revealSegment = (
  segment: TranscriptSegmentView,
  revealedChars: number
): TranscriptSegmentView => {
  const text = revealTranscriptText(segment.text, revealedChars)
  if (text === segment.text) {
    return segment
  }
  return {
    ...segment,
    text,
    words: undefined
  }
}

/**
 * Map a worker/host partial payload into caption rows.
 */
export const toPartialSegmentViews = (rows: PartialTranscriptRow[]): TranscriptSegmentView[] =>
  rows.map((segment, index) => ({
    id: `partial-${segment.startMs}-${segment.endMs}`,
    speakerId: segment.speakerKey,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    words: segment.words,
    confidence: segment.confidence,
    sortIndex: index
  }))

/**
 * Build a speaker label from an anonymous pipeline key such as `speaker-2`.
 */
export const speakerLabelFromKey = (key: string, index: number): string => {
  const match = /^speaker-(\d+)$/i.exec(key)
  if (match?.[1]) {
    return `Speaker ${match[1]}`
  }
  return `Speaker ${index + 1}`
}

/**
 * Synthesize speaker rows from streaming partials before the final record lands.
 */
export const speakersFromSegments = (
  segments: Pick<TranscriptSegmentView, 'speakerId'>[]
): TranscriptSpeakerView[] => {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const segment of segments) {
    if (!segment.speakerId || seen.has(segment.speakerId)) {
      continue
    }
    seen.add(segment.speakerId)
    keys.push(segment.speakerId)
  }
  return keys.map((key, index) => ({
    id: key,
    speakerKey: key,
    displayName: speakerLabelFromKey(key, index),
    sortIndex: index
  }))
}
