import { existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Task } from '@vidbee/task-queue'
import { resolveLegacySocialMediaFile } from './social-media-file'

const fileOk = (path: string | null | undefined): path is string =>
  Boolean(path && existsSync(path) && statSync(path).size > 0)

const AUDIO_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.flv',
  '.ts',
  '.m4a',
  '.mp3',
  '.aac',
  '.opus',
  '.ogg',
  '.wav',
  '.flac'
])

/**
 * The one audio/video file a gallery or social run saved, or `null` for
 * multi-item collections and image-only posts, which have no single source.
 */
const resolveCollectionSourceFile = (task: Readonly<Task>): string | null => {
  const output = task.output
  const summary = output?.collectionSummary
  const singleItem = summary
    ? summary.posts <= 1 && summary.videos <= 1
    : (output?.fileCount ?? 0) <= 1
  if (!singleItem) {
    return null
  }
  const candidate =
    task.kind === 'social-media' && output?.filePath === summary?.manifestPath
      ? resolveLegacySocialMediaFile(task)
      : output?.filePath
  return fileOk(candidate) && AUDIO_VIDEO_EXTENSIONS.has(extname(candidate).toLowerCase())
    ? candidate
    : null
}

/** Resolve playable media without treating a subtitle export as an audio/video source. */
export const resolveTaskSourceFile = (task: Readonly<Task>): string | null => {
  if (task.kind === 'subtitles') {
    return null
  }
  // Older photo tasks may still have kind "video" when retried after an update.
  if (task.output?.outputDirectory) {
    return resolveCollectionSourceFile(task)
  }
  if (fileOk(task.output?.filePath)) {
    return task.output.filePath
  }
  const opts = (task.input.options ?? {}) as Record<string, unknown>
  const downloadPath = typeof opts.downloadPath === 'string' ? opts.downloadPath : null
  const custom = typeof opts.customDownloadPath === 'string' ? opts.customDownloadPath : null
  const saved = typeof opts.savedFileName === 'string' ? opts.savedFileName : null
  const dir = custom || downloadPath
  if (dir && saved) {
    const candidate = join(dir, saved)
    if (fileOk(candidate)) {
      return candidate
    }
  }
  return null
}
