const NATIVE_AUDIO_CONTAINERS = new Set(['.aac', '.flac', '.mp3', '.ogg', '.opus', '.wav'])

/**
 * Return the lowercase file extension, including the leading dot.
 */
const extensionOf = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const base = slash >= 0 ? normalized.slice(slash + 1) : normalized
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) {
    return ''
  }
  return base.slice(dot).toLowerCase()
}

/**
 * True when Chromium can play this path as audio without remuxing or transcoding.
 */
export const isNativelyPlayableAudio = (filePath: string): boolean =>
  NATIVE_AUDIO_CONTAINERS.has(extensionOf(filePath))
