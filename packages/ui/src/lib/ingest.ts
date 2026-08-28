const AUDIO_EXTENSIONS = new Set(['aac', 'aiff', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav', 'wma'])

const VIDEO_EXTENSIONS = new Set([
  '3gp',
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
  'wmv'
])

const HTTP_URL_RE = /https?:\/\/[^\s<>"'`]+/gi
const FILE_URL_RE = /file:\/\/[^\s<>"'`]+/gi
const WINDOWS_PATH_RE = /^[a-zA-Z]:[\\/]/
const UNC_PATH_RE = /^\\\\/

export type MediaKind = 'audio' | 'video'

export interface ClassifiedIngestText {
  urls: string[]
  mediaPaths: string[]
}

export interface ClassifiedDataTransfer {
  urls: string[]
  mediaFiles: File[]
  mediaPaths: string[]
  hadInput: boolean
}

/**
 * Return the lowercase file extension without the leading dot.
 */
export const fileExtension = (name: string): string => {
  const trimmed = name.trim()
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) {
    return ''
  }
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Classify a filename as audio, video, or unsupported.
 */
export const mediaKindFromName = (name: string): MediaKind | null => {
  const ext = fileExtension(name)
  if (AUDIO_EXTENSIONS.has(ext)) {
    return 'audio'
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video'
  }
  return null
}

/**
 * Classify a MIME type as audio, video, or unsupported.
 */
export const mediaKindFromMime = (mime: string): MediaKind | null => {
  const normalized = mime.trim().toLowerCase()
  if (normalized.startsWith('audio/')) {
    return 'audio'
  }
  if (normalized.startsWith('video/')) {
    return 'video'
  }
  return null
}

/**
 * Return whether a File looks like audio or video.
 */
export const isMediaFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  mediaKindFromMime(file.type) !== null || mediaKindFromName(file.name) !== null

/**
 * Return whether a string is an http(s) URL.
 */
export const isLikelyHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Convert a file:// URL to a filesystem path when possible.
 */
export const fileUrlToPath = (value: string): string | null => {
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'file:') {
      return null
    }
    const decoded = decodeURIComponent(parsed.pathname)
    if (/^\/[a-zA-Z]:\//.test(decoded)) {
      return decoded.slice(1).replace(/\//g, '\\')
    }
    return decoded
  } catch {
    return null
  }
}

/**
 * Return whether a string looks like a local media path or file URL.
 */
export const isMediaPath = (value: string): boolean => {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed) {
    return false
  }
  if (trimmed.toLowerCase().startsWith('file:')) {
    const path = fileUrlToPath(trimmed)
    return path ? mediaKindFromName(path) !== null : false
  }
  const looksLikePath =
    trimmed.startsWith('/') || WINDOWS_PATH_RE.test(trimmed) || UNC_PATH_RE.test(trimmed)
  return looksLikePath && mediaKindFromName(trimmed) !== null
}

/**
 * Deduplicate trimmed strings while preserving order.
 */
const unique = (values: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.trim()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(key)
  }
  return out
}

/**
 * Strip a single pair of wrapping quotes from a pasted path.
 */
const stripWrappingQuotes = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '')

/**
 * Extract http(s) URLs from freeform pasted text.
 */
const collectHttpUrls = (text: string): string[] => {
  const matches = text.match(HTTP_URL_RE) ?? []
  return unique(matches.map((match) => match.replace(/[),.;]+$/, '')).filter(isLikelyHttpUrl))
}

/**
 * Extract local media paths and file:// URLs from freeform pasted text.
 */
const collectMediaPaths = (text: string): string[] => {
  const fromFileUrls = (text.match(FILE_URL_RE) ?? [])
    .map((match) => fileUrlToPath(match.replace(/[),.;]+$/, '')) ?? '')
    .filter((path) => path && mediaKindFromName(path) !== null)
  const fromLines = text
    .split(/\r?\n/)
    .map(stripWrappingQuotes)
    .filter((line) => isMediaPath(line))
    .map((line) => (line.toLowerCase().startsWith('file:') ? (fileUrlToPath(line) ?? line) : line))
  return unique([...fromFileUrls, ...fromLines])
}

/**
 * Split pasted or dropped text into download URLs and local media paths.
 */
export const classifyIngestText = (text: string): ClassifiedIngestText => {
  const trimmed = text.trim()
  if (!trimmed) {
    return { urls: [], mediaPaths: [] }
  }
  return {
    urls: collectHttpUrls(trimmed),
    mediaPaths: collectMediaPaths(trimmed)
  }
}

/**
 * Parse a text/uri-list payload, dropping comment lines.
 */
const readUriList = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

/**
 * Classify a drag/paste DataTransfer into URLs, media files, and media paths.
 */
export const classifyDataTransfer = (data: DataTransfer): ClassifiedDataTransfer => {
  const uriList = data.getData('text/uri-list')
  const plain = data.getData('text/plain')
  const textParts = [...readUriList(uriList), plain]
  const fromText = classifyIngestText(textParts.filter(Boolean).join('\n'))
  const mediaFiles = Array.from(data.files ?? []).filter(isMediaFile)
  const hadInput =
    mediaFiles.length > 0 ||
    fromText.urls.length > 0 ||
    fromText.mediaPaths.length > 0 ||
    Boolean(uriList.trim() || plain.trim()) ||
    (data.files?.length ?? 0) > 0
  return {
    urls: fromText.urls,
    mediaFiles,
    mediaPaths: fromText.mediaPaths,
    hadInput
  }
}

/**
 * Return whether a DataTransfer currently holds ingestible URLs or media.
 */
export const dataTransferHasIngest = (data: DataTransfer | null): boolean => {
  if (!data) {
    return false
  }
  if (Array.from(data.files ?? []).some(isMediaFile)) {
    return true
  }
  const types = Array.from(data.types ?? [])
  if (types.includes('text/uri-list') || types.includes('text/plain') || types.includes('Files')) {
    return true
  }
  return false
}
