export interface TimedRange {
  endMs: number
  startMs: number
}

/**
 * Return the index of the segment at `timeMs`, or the next upcoming one.
 */
export const segmentIndexAtTime = <T extends TimedRange>(
  segments: readonly T[],
  timeMs: number
): number => {
  if (segments.length === 0 || !Number.isFinite(timeMs)) {
    return -1
  }
  let low = 0
  let high = segments.length - 1
  let lastStarted = -1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const startMs = segments[mid]?.startMs ?? 0
    if (startMs <= timeMs) {
      lastStarted = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (lastStarted >= 0) {
    const current = segments[lastStarted]
    if (current && timeMs < current.endMs) {
      return lastStarted
    }
  }
  const upcoming = lastStarted + 1
  return upcoming < segments.length ? upcoming : -1
}

/**
 * Return the segment whose range contains `timeMs`, or the next upcoming one.
 */
export const segmentAtTime = <T extends TimedRange>(
  segments: readonly T[],
  timeMs: number
): T | null => {
  const index = segmentIndexAtTime(segments, timeMs)
  return index >= 0 ? (segments[index] ?? null) : null
}
