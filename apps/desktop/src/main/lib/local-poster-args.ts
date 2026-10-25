import crypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'

/**
 * Extensions ffmpeg can decode a still from. Sites that hand us no thumbnail
 * URL (every gallery-dl route) leave the saved file as the only poster source.
 */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ts', '.flv'])

/** Longest edge of a generated poster. Rows paint it at 56px tall. */
const POSTER_WIDTH = 320
/** Seek before grabbing a frame so videos that open on black still show something. */
export const VIDEO_SEEK_SECONDS = 1

/** True when this file is one a poster can be rendered from. */
export const isPosterSource = (filePath: string): boolean => {
  const extension = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)
}

/** True when a poster of this file needs a seek to a frame rather than a decode. */
export const isVideoSource = (filePath: string): boolean =>
  VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())

/**
 * ffmpeg arguments that write one downscaled JPEG. Videos seek first so the
 * poster is not the black frame many encodes open on.
 *
 * @param source Media file on disk.
 * @param target Where to write the JPEG.
 * @param seekSeconds Offset to grab the frame at; 0 takes the first frame.
 */
export const buildPosterArgs = (source: string, target: string, seekSeconds = 0): string[] => [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  ...(seekSeconds > 0 ? ['-ss', String(seekSeconds)] : []),
  '-i',
  source,
  '-frames:v',
  '1',
  '-vf',
  `scale='min(${POSTER_WIDTH},iw)':-2`,
  '-f',
  'image2',
  target
]

/**
 * Seek offsets to try, in order. A clip shorter than the seek yields no frame,
 * so videos fall back to frame one; stills only have frame one.
 *
 * @param filePath Media file the poster is rendered from.
 */
export const posterSeekPlan = (filePath: string): readonly number[] =>
  isVideoSource(filePath) ? [VIDEO_SEEK_SECONDS, 0] : [0]

/**
 * Cache key of a poster: identity plus mtime and size, so a re-downloaded file
 * replaces its poster instead of reusing a stale one.
 *
 * @param filePath Media file the poster is rendered from.
 * @param info The file's current mtime and size.
 */
export const posterSourceKey = (
  filePath: string,
  info: { readonly mtimeMs: number; readonly size: number }
): string =>
  crypto.createHash('sha1').update(`${filePath}:${info.mtimeMs}:${info.size}`).digest('hex')

/**
 * The first non-empty media file in a collection's output directory, in name
 * order, so a multi-file post shows its own first asset rather than nothing.
 * Subdirectories and sidecars (`.json`, `.txt`) are skipped.
 *
 * @param directory Directory the task wrote into.
 */
export const firstMediaInDirectory = async (directory: string): Promise<string | null> => {
  let entries: string[]
  try {
    entries = await fsPromises.readdir(directory)
  } catch {
    return null
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!isPosterSource(entry)) {
      continue
    }
    const info = await fsPromises.stat(path.join(directory, entry)).catch(() => null)
    if (info?.isFile() && info.size > 0) {
      names.push(entry)
    }
  }
  names.sort((left, right) => left.localeCompare(right))
  const first = names[0]
  return first ? path.join(directory, first) : null
}

export interface LocalPosterRequest {
  /** The task's own saved file, when the renderer managed to resolve one. */
  filePath?: string | null
  /** A collection's output directory, used when there is no single file. */
  directory?: string | null
}

export interface PosterSource {
  /** Cache key from {@link posterSourceKey}. */
  readonly key: string
  /** Media file to render from. */
  readonly path: string
}

/**
 * Pick the file to render from: the task's own media file when it is one,
 * otherwise the first media in its collection directory. Missing and
 * zero-byte files give null.
 *
 * @param request Saved file and/or collection directory from the renderer.
 */
export const resolvePosterSource = async (
  request: LocalPosterRequest
): Promise<PosterSource | null> => {
  let candidate: string | null = null
  if (request.filePath && isPosterSource(request.filePath)) {
    candidate = request.filePath
  } else if (request.directory) {
    candidate = await firstMediaInDirectory(request.directory)
  }
  if (!candidate) {
    return null
  }
  try {
    const info = await fsPromises.stat(candidate)
    if (!(info.isFile() && info.size > 0)) {
      return null
    }
    return { key: posterSourceKey(candidate, info), path: candidate }
  } catch {
    return null
  }
}
