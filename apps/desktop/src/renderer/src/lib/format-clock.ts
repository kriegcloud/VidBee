export const PLAYER_SKIP_SECONDS = 15

/**
 * Format a duration in seconds as `m:ss` or `h:mm:ss`.
 */
export const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

/**
 * Format a share-card timestamp as total minutes (`184:16`).
 */
export const formatShareClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

/**
 * Format a player timestamp as zero-padded `HH:MM:SS`.
 */
export const formatPlayerClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

/**
 * Clamp a seek target to the playable range.
 */
export const clampSeekSeconds = (next: number, duration: number): number => {
  if (!Number.isFinite(next)) {
    return 0
  }
  const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY
  return Math.min(upper, Math.max(0, next))
}
