import path from 'node:path'
import type { AppSettings, DownloadOptions } from '../../shared/types'

const INVALID_VARIATION_SELECTOR_REGEX = /[\ufe00-\ufe0f]/gu
const INVALID_PATH_SEGMENT_PUNCTUATION_REGEX = /[\\/:*?"<>|]+/g

interface VideoDownloadPathInfo {
  title?: string
  uploader?: string
}

/**
 * Return whether a code point is unsafe inside a path segment.
 */
const isInvalidPathCodePoint = (codePoint: number): boolean => {
  if (codePoint <= 0x1f) {
    return true
  }
  if (codePoint >= 0x7f && codePoint <= 0x9f) {
    return true
  }
  return codePoint >= 0xff_f0 && codePoint <= 0xff_ff
}

/**
 * Normalize user-derived path segments so they remain valid on desktop filesystems.
 */
const sanitizePathSegment = (value: string): string => {
  const filtered = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint !== undefined && !isInvalidPathCodePoint(codePoint)
    })
    .join('')

  return filtered
    .replace(INVALID_VARIATION_SELECTOR_REGEX, '')
    .replace(INVALID_PATH_SEGMENT_PUNCTUATION_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
}

/**
 * Sanitize a folder name generated from remote metadata.
 */
export const sanitizeFolderName = (value: string, fallback: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return fallback
  }
  const sanitized = sanitizePathSegment(trimmed)
  return sanitized || fallback
}

/**
 * Resolve the on-disk folder for a single-video download.
 *
 * Files land in `{downloadPath}/{channel}` by default. Issue #263 keeps them
 * in `{downloadPath}` when the user disables channel subfolders.
 */
export const resolveAutoVideoDownloadPath = (
  basePath: string,
  info?: VideoDownloadPathInfo | null,
  skipChannelSubfolders = false
): string => {
  if (!info || skipChannelSubfolders) {
    return basePath
  }
  const label = info.uploader?.trim() || info.title?.trim()
  if (!label) {
    return basePath
  }
  return path.join(basePath, sanitizeFolderName(label, 'Video'))
}

/**
 * Attach the automatic channel folder when the caller did not pick a custom
 * directory. Playlist, subscription, and user-selected folders keep the path
 * they already set.
 */
export const applyAutoVideoDownloadPath = (
  options: DownloadOptions,
  settings: Pick<AppSettings, 'downloadPath' | 'downloadWithoutChannelSubfolders'>
): DownloadOptions => {
  if (options.customDownloadPath?.trim()) {
    return options
  }
  return {
    ...options,
    customDownloadPath: resolveAutoVideoDownloadPath(
      settings.downloadPath,
      { title: options.title, uploader: options.uploader },
      settings.downloadWithoutChannelSubfolders
    )
  }
}
