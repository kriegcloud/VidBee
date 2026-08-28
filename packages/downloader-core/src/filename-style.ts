export const FILENAME_STYLES = ['classic', 'basic', 'pretty', 'nerdy'] as const

export type FilenameStyle = (typeof FILENAME_STYLES)[number]

export const DEFAULT_FILENAME_STYLE: FilenameStyle = 'pretty'
export const DEFAULT_FILENAME_VIA_VIDBEE = true

export const VIA_VIDBEE_LABEL = 'via VidBee'
export const DEFAULT_FILENAME_TEMPLATE = '%(title)s.%(ext)s'
export const SHARED_FILENAME_TEMPLATE = `%(title)s ${VIA_VIDBEE_LABEL}.%(ext)s`

const VIA_VIDBEE_SUFFIX = ` ${VIA_VIDBEE_LABEL}`
const YTDLP_EXT_TOKEN = '.%(ext)s'
const AUTHOR_FIELD = '%(uploader,creator,channel,uploader_id)s'

const FILENAME_STYLE_TEMPLATES: Record<FilenameStyle, { audio: string; video: string }> = {
  basic: {
    audio: `%(title)s - ${AUTHOR_FIELD}.%(ext)s`,
    video: `%(title)s - ${AUTHOR_FIELD} (%(height)sp, %(vcodec)s).%(ext)s`
  },
  classic: {
    audio: '%(extractor)s_%(id)s_audio.%(ext)s',
    video: '%(extractor)s_%(id)s_%(width)sx%(height)s_%(vcodec)s.%(ext)s'
  },
  nerdy: {
    audio: `%(title)s - ${AUTHOR_FIELD} (%(extractor)s, %(id)s).%(ext)s`,
    video: `%(title)s - ${AUTHOR_FIELD} (%(height)sp, %(vcodec)s, %(extractor)s, %(id)s).%(ext)s`
  },
  pretty: {
    audio: `%(title)s - ${AUTHOR_FIELD} (%(extractor)s).%(ext)s`,
    video: `%(title)s - ${AUTHOR_FIELD} (%(height)sp, %(vcodec)s, %(extractor)s).%(ext)s`
  }
}

export const FILENAME_STYLE_PREVIEWS: Record<FilenameStyle, { audio: string; video: string }> = {
  basic: {
    audio: 'Audio Title - Audio Author.mp3',
    video: 'Video Title - Video Author (1080p, h264).mp4'
  },
  classic: {
    audio: 'youtube_dQw4w9WgXcQ_audio.mp3',
    video: 'youtube_dQw4w9WgXcQ_1920x1080_h264.mp4'
  },
  nerdy: {
    audio: 'Audio Title - Audio Author (youtube, dQw4w9WgXcQ).mp3',
    video: 'Video Title - Video Author (1080p, h264, youtube, dQw4w9WgXcQ).mp4'
  },
  pretty: {
    audio: 'Audio Title - Audio Author (youtube).mp3',
    video: 'Video Title - Video Author (1080p, h264, youtube).mp4'
  }
}

/**
 * Return whether a value is a supported filename style.
 *
 * @param value Unknown setting value from storage or the UI.
 * @returns True when the value is a known filename style.
 */
export const isFilenameStyle = (value: unknown): value is FilenameStyle =>
  typeof value === 'string' && (FILENAME_STYLES as readonly string[]).includes(value)

/**
 * Insert `via VidBee` before the file extension when the setting is on.
 *
 * Already branded names are left unchanged so share-watermark templates and
 * repeated calls do not double the suffix.
 *
 * @param value yt-dlp template or preview filename.
 * @param enabled Whether the via VidBee suffix should be applied.
 * @returns The original value, or the same name with `via VidBee` added.
 */
export const applyViaVidBeeFilename = (
  value: string,
  enabled = DEFAULT_FILENAME_VIA_VIDBEE
): string => {
  if (!enabled || value.includes(VIA_VIDBEE_LABEL)) {
    return value
  }

  if (value.endsWith(YTDLP_EXT_TOKEN)) {
    return `${value.slice(0, -YTDLP_EXT_TOKEN.length)}${VIA_VIDBEE_SUFFIX}${YTDLP_EXT_TOKEN}`
  }

  const lastDot = value.lastIndexOf('.')
  if (lastDot > 0) {
    return `${value.slice(0, lastDot)}${VIA_VIDBEE_SUFFIX}${value.slice(lastDot)}`
  }

  return `${value}${VIA_VIDBEE_SUFFIX}`
}

/**
 * Resolve the yt-dlp output template for a filename style and download type.
 *
 * Custom caller templates still win. Share-watermark mode always uses the
 * branded title template. An unset style uses pretty. An unset via VidBee
 * flag defaults to on.
 *
 * @param style Saved filename style, or undefined for the pretty default.
 * @param type Video or audio download.
 * @param shareWatermark Whether the share-watermark filename should be used.
 * @param filenameViaVidBee Whether to append via VidBee before the extension.
 * @returns A yt-dlp `-o` template without the download directory.
 */
export const resolveFilenameTemplate = (
  style: FilenameStyle | undefined,
  type: 'audio' | 'video',
  shareWatermark = false,
  filenameViaVidBee = DEFAULT_FILENAME_VIA_VIDBEE
): string => {
  if (shareWatermark) {
    return SHARED_FILENAME_TEMPLATE
  }

  const resolvedStyle = isFilenameStyle(style) ? style : DEFAULT_FILENAME_STYLE
  return applyViaVidBeeFilename(FILENAME_STYLE_TEMPLATES[resolvedStyle][type], filenameViaVidBee)
}
