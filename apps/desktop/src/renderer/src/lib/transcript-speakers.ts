import type { TranscriptSegmentView, TranscriptSpeakerView } from '@renderer/store/transcripts'

export interface SpeakerRange {
  endMs: number
  startMs: number
}

export interface SpeakerTimelineRow {
  ranges: SpeakerRange[]
  share: number
  sortIndex: number
  speakerId: string
  speakingMs: number
}

export interface SpeakerColorClasses {
  avatar: string
  bar: string
  ring: string
}

const MERGE_GAP_MS = 400
const MIN_VISIBLE_RANGE_PERCENT = 0.4

export const SPEAKER_COLOR_PALETTE: SpeakerColorClasses[] = [
  {
    avatar: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
    ring: 'ring-sky-500/50'
  },
  {
    avatar: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    ring: 'ring-emerald-500/50'
  },
  {
    avatar: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
    ring: 'ring-violet-500/50'
  },
  {
    avatar: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    bar: 'bg-amber-500',
    ring: 'ring-amber-500/50'
  },
  {
    avatar: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    ring: 'ring-rose-500/50'
  },
  {
    avatar: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    bar: 'bg-cyan-500',
    ring: 'ring-cyan-500/50'
  },
  {
    avatar: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    bar: 'bg-orange-500',
    ring: 'ring-orange-500/50'
  },
  {
    avatar: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    bar: 'bg-indigo-500',
    ring: 'ring-indigo-500/50'
  }
]

export const UNKNOWN_SPEAKER_COLOR: SpeakerColorClasses = {
  avatar: 'bg-muted text-muted-foreground',
  bar: 'bg-zinc-400',
  ring: 'ring-zinc-400/50'
}

/**
 * Pick a stable color set for a speaker, or the muted fallback.
 */
export const speakerColor = (sortIndex: number | null): SpeakerColorClasses => {
  if (sortIndex == null) {
    return UNKNOWN_SPEAKER_COLOR
  }
  const count = SPEAKER_COLOR_PALETTE.length
  const index = ((sortIndex % count) + count) % count
  return SPEAKER_COLOR_PALETTE[index] ?? UNKNOWN_SPEAKER_COLOR
}

/**
 * Build a short avatar label from a speaker display name.
 */
export const speakerInitials = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return '?'
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = [...(parts[0] ?? '')][0] ?? ''
    const second = [...(parts[1] ?? '')][0] ?? ''
    return `${first}${second}`.toUpperCase()
  }
  return [...trimmed].slice(0, 2).join('').toUpperCase()
}

/**
 * Merge overlapping or nearly adjacent speech ranges.
 */
export const mergeRanges = (ranges: SpeakerRange[]): SpeakerRange[] => {
  if (ranges.length === 0) {
    return []
  }
  const sorted = [...ranges].sort((left, right) => left.startMs - right.startMs)
  const first = sorted[0]
  if (!first) {
    return []
  }
  const merged: SpeakerRange[] = [{ endMs: first.endMs, startMs: first.startMs }]
  for (const range of sorted.slice(1)) {
    const last = merged.at(-1)
    if (!last) {
      break
    }
    if (range.startMs <= last.endMs + MERGE_GAP_MS) {
      last.endMs = Math.max(last.endMs, range.endMs)
    } else {
      merged.push({ endMs: range.endMs, startMs: range.startMs })
    }
  }
  return merged
}

/**
 * Prefer the player duration, then fall back to the last caption end.
 */
export const resolveMediaDurationMs = (
  playerDurationMs: number,
  segments: Pick<TranscriptSegmentView, 'endMs'>[]
): number => {
  if (Number.isFinite(playerDurationMs) && playerDurationMs > 0) {
    return playerDurationMs
  }
  let maxEnd = 0
  for (const segment of segments) {
    if (segment.endMs > maxEnd) {
      maxEnd = segment.endMs
    }
  }
  return maxEnd
}

/**
 * Build per-speaker talking-time stats and timeline ranges.
 */
export const buildSpeakerTimelines = (
  speakers: Pick<TranscriptSpeakerView, 'id' | 'sortIndex'>[],
  segments: Pick<TranscriptSegmentView, 'endMs' | 'speakerId' | 'startMs'>[]
): SpeakerTimelineRow[] => {
  const rangesById = new Map<string, SpeakerRange[]>()
  for (const speaker of speakers) {
    rangesById.set(speaker.id, [])
  }

  let totalMs = 0
  for (const segment of segments) {
    if (!segment.speakerId) {
      continue
    }
    const ranges = rangesById.get(segment.speakerId)
    if (!ranges) {
      continue
    }
    const startMs = Math.max(0, segment.startMs)
    const endMs = Math.max(startMs, segment.endMs)
    const duration = endMs - startMs
    if (duration <= 0) {
      continue
    }
    ranges.push({ endMs, startMs })
    totalMs += duration
  }

  return speakers.flatMap((speaker) => {
    const rawRanges = rangesById.get(speaker.id) ?? []
    const speakingMs = rawRanges.reduce((sum, range) => sum + (range.endMs - range.startMs), 0)
    if (speakingMs <= 0) {
      return []
    }
    return [
      {
        ranges: mergeRanges(rawRanges),
        share: totalMs > 0 ? speakingMs / totalMs : 0,
        sortIndex: speaker.sortIndex,
        speakerId: speaker.id,
        speakingMs
      }
    ]
  })
}

/**
 * Convert a talking-time share to a whole-number percent.
 */
export const speakingSharePercent = (share: number): number => {
  if (share <= 0) {
    return 0
  }
  return Math.max(1, Math.round(share * 100))
}

/**
 * Position a speech burst on a 0-100 timeline track.
 */
export const rangePosition = (
  range: SpeakerRange,
  durationMs: number
): { left: string; width: string } => {
  if (durationMs <= 0) {
    return { left: '0%', width: '0%' }
  }
  const left = Math.max(0, (range.startMs / durationMs) * 100)
  const width = Math.max(
    MIN_VISIBLE_RANGE_PERCENT,
    ((range.endMs - range.startMs) / durationMs) * 100
  )
  return {
    left: `${left}%`,
    width: `${Math.min(100 - left, width)}%`
  }
}

/**
 * Clamp the playhead to the visible timeline.
 */
export const playheadPercent = (currentMs: number, durationMs: number): number => {
  if (durationMs <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (currentMs / durationMs) * 100))
}
