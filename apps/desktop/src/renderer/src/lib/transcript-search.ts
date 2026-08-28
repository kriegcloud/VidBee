export interface HighlightPart {
  match: boolean
  start: number
  text: string
}

/**
 * Escape a user query so it can be used in a regular expression.
 */
export const escapeSearchQuery = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Return whether a transcript line matches the current search query.
 */
export const matchesTranscriptQuery = (
  query: string,
  text: string,
  speakerName: string
): boolean => {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return text.toLowerCase().includes(needle) || speakerName.toLowerCase().includes(needle)
}

/**
 * Split text into highlighted and plain parts for the search query.
 */
export const splitHighlightedParts = (text: string, query: string): HighlightPart[] => {
  const needle = query.trim()
  if (!needle) {
    return [{ match: false, start: 0, text }]
  }
  const pattern = new RegExp(`(${escapeSearchQuery(needle)})`, 'gi')
  const parts: HighlightPart[] = []
  let start = 0
  for (const part of text.split(pattern)) {
    if (!part) {
      continue
    }
    parts.push({
      match: part.toLowerCase() === needle.toLowerCase(),
      start,
      text: part
    })
    start += part.length
  }
  return parts
}
