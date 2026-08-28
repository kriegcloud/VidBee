export type VideoSubtitleAudioCodec = 'aac' | 'copy'

export interface BuildVideoSubtitleArgsInput {
  audio?: VideoSubtitleAudioCodec
  outputPath: string
  sourcePath: string
  subtitlePath: string
}

const OUT_TIME = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/

/**
 * Escape a filesystem path for ffmpeg `ass=` / `subtitles=` filters.
 */
export const escapeFfmpegSubtitlePath = (filePath: string): string =>
  filePath
    .replaceAll('\\', '/')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')

/**
 * Parse `out_time=` lines from ffmpeg `-progress` output into milliseconds.
 */
export const parseFfmpegOutTimeMs = (chunk: string): number | null => {
  const match = OUT_TIME.exec(chunk)
  if (!match) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return null
  }
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
}

/**
 * Convert elapsed time into a 0-100 percent, or null when duration is unknown.
 */
export const progressPercent = (elapsedMs: number, durationMs: number): number | null => {
  if (durationMs <= 0) {
    return null
  }
  return Math.max(0, Math.min(100, Math.round((elapsedMs / durationMs) * 100)))
}

/**
 * Build ffmpeg args that mux a subtitle track without re-encoding the picture.
 */
export const buildSoftSubtitleMuxArgs = (input: BuildVideoSubtitleArgsInput): string[] => [
  '-hide_banner',
  '-nostats',
  '-progress',
  'pipe:1',
  '-y',
  '-i',
  input.sourcePath,
  '-i',
  input.subtitlePath,
  '-map',
  '0:v:0',
  '-map',
  '0:a?',
  '-map',
  '1:0',
  '-c:v',
  'copy',
  '-c:a',
  'copy',
  '-c:s',
  'srt',
  '-disposition:s:0',
  'default',
  '-metadata:s:s:0',
  'language=und',
  '-metadata:s:s:0',
  'title=VidBee',
  '-f',
  'matroska',
  input.outputPath
]

/**
 * Build ffmpeg args that burn captions into the video frames.
 */
export const buildHardSubtitleBurnArgs = (input: BuildVideoSubtitleArgsInput): string[] => {
  const args = [
    '-hide_banner',
    '-nostats',
    '-progress',
    'pipe:1',
    '-y',
    '-i',
    input.sourcePath,
    '-vf',
    `ass='${escapeFfmpegSubtitlePath(input.subtitlePath)}'`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-sn',
    '-movflags',
    '+faststart',
    '-f',
    'mp4'
  ]
  if (input.audio === 'aac') {
    args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2')
  } else {
    args.push('-c:a', 'copy')
  }
  args.push(input.outputPath)
  return args
}
