const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** Human-readable byte size using 1024 steps, e.g. `11.3 MB`. */
export const formatMediaBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const exponent = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[exponent]}`
}

/** `1080 × 1350`, or null when unknown. */
export const formatDimensions = (width?: number, height?: number): string | null =>
  width && height ? `${width} × ${height}` : null

/** `m:ss` or `h:mm:ss` for a millisecond duration. */
export const formatMediaDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}
