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
