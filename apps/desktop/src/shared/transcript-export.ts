import { applyViaVidBeeFilename } from '@vidbee/downloader-core/filename-style'
import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as A from 'effect/Array'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import * as Sparse from './ArrayHelpers.js'
import { recordFunction } from './RecordFunction.js'
import { buildSrtDocument, formatSrtClock } from './subtitle-export'

const $I = $DesktopId.create('shared/transcript-export')
/** BuildTranscriptExportInput shared contract.
 * @category ports
 * @since 0.0.0
 * @example BuildTranscriptExportInput
 */
export interface BuildTranscriptExportInput {
  format: TranscriptExportFormat
  grouping: TranscriptExportGrouping
  resolveSpeaker: (speakerId: string | null) => string
  segments: TranscriptExportSegment[]
  showTimestamp: boolean
  style: TranscriptExportStyle
}
interface TextPiece {
  end: number
  start: number
  text: string
}
const SENTENCE_SPLIT = /(?<=[.!?。！？…])\s*/

/**
 * Format a clock as `MM:SS.mmm`, matching the export preview.
 * @example formatExportClock
 * @category utilities
 * @since 0.0.0
 */
export const formatExportClock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms))
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${Str.padStart(2, '0')(String(minutes))}:${Str.padStart(2, '0')(String(seconds))}.${Str.padStart(3, '0')(String(millis))}`
}

/**
 * Split text with Intl.Segmenter when available, then fall back to regex.
 */
const splitWithSegmenter = (text: string, granularity: 'word' | 'sentence'): TextPiece[] | null => {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return null
  }
  const segmenter = new Intl.Segmenter(undefined, {
    granularity
  })
  const pieces: TextPiece[] = []
  for (const part of segmenter.segment(text)) {
    const value = Str.trim(part.segment)
    if (value.length === 0) {
      continue
    }
    if (granularity === 'word' && part.isWordLike === false) {
      continue
    }
    pieces.push({
      end: part.index + part.segment.length,
      start: part.index,
      text: value
    })
  }
  return pieces.length > 0 ? pieces : null
}

/**
 * Split a segment into word or sentence pieces and interpolate timestamps.
 */
const splitSegment = (
  segment: TranscriptExportSegment,
  grouping: Exclude<TranscriptExportGrouping, 'none'>
): TranscriptExportUnit[] => {
  const text = Str.trim(segment.text)
  if (text.length === 0) {
    return []
  }
  const pieces =
    grouping === 'words'
      ? (splitWithSegmenter(text, 'word') ??
        Sparse.map({
          items: Sparse.filter({
            items: Str.split(/\s+/)(text),
            predicate: Boolean
          }),
          map: (value, index) => ({
            end: index + 1,
            start: index,
            text: value
          })
        }))
      : (splitWithSegmenter(text, 'sentence') ??
        Sparse.map({
          items: Sparse.filter({
            items: Sparse.map({
              items: Str.split(SENTENCE_SPLIT)(text),
              map: (value) => Str.trim(value)
            }),
            predicate: Boolean
          }),
          map: (value, index) => ({
            end: index + 1,
            start: index,
            text: value
          })
        }))
  if (pieces.length === 0) {
    return [
      {
        endMs: segment.endMs,
        speakerId: segment.speakerId,
        startMs: segment.startMs,
        text
      }
    ]
  }
  const duration = Math.max(0, segment.endMs - segment.startMs)
  const lastEnd = pieces.at(-1)?.end ?? 1
  const span = Math.max(1, lastEnd)
  return Sparse.map({
    items: pieces,
    map: (piece) => ({
      endMs: segment.startMs + Math.round((piece.end / span) * duration),
      speakerId: segment.speakerId,
      startMs: segment.startMs + Math.round((piece.start / span) * duration),
      text: piece.text
    })
  })
}

/**
 * Expand source segments according to the selected grouping.
 */
function buildExportUnitsBody(
  segments: TranscriptExportSegment[],
  grouping: TranscriptExportGrouping
): TranscriptExportUnit[] {
  if (grouping === 'none') {
    return Sparse.filter({
      items: Sparse.map({
        items: segments,
        map: (segment) => ({
          endMs: segment.endMs,
          speakerId: segment.speakerId,
          startMs: segment.startMs,
          text: Str.trim(segment.text)
        })
      }),
      predicate: (unit) => unit.text.length > 0
    })
  }
  return Sparse.flatMap({
    items: segments,
    map: (segment) => splitSegment(segment, grouping)
  })
}

/**
 * Render one export unit in the selected style and file format.
 */
const renderUnit = (
  unit: TranscriptExportUnit,
  index: number,
  input: BuildTranscriptExportInput
): string => {
  const { format, resolveSpeaker, showTimestamp, style } = input
  const isMarkdown = format === 'md'
  const start = formatExportClock(unit.startMs)
  const range = `${start} --> ${formatExportClock(unit.endMs)}`
  const srtRange = `${formatSrtClock(unit.startMs)} --> ${formatSrtClock(unit.endMs)}`
  switch (style) {
    case 'subtitles': {
      if (isMarkdown) {
        const heading = showTimestamp ? `${index + 1}. \`${srtRange}\`` : `${index + 1}.`
        return `${heading}\n\n${unit.text}`
      }
      const lines = [String(index + 1)]
      if (showTimestamp) {
        lines.push(srtRange)
      }
      lines.push(unit.text)
      return A.join(lines, '\n')
    }
    case 'segments': {
      const speaker = resolveSpeaker(unit.speakerId)
      if (isMarkdown) {
        const heading = showTimestamp ? `### ${speaker}\n\n\`${start}\`` : `### ${speaker}`
        return `${heading}\n\n${unit.text}`
      }
      const heading = showTimestamp ? `${speaker}  ${start}` : speaker
      return `${heading}\n${unit.text}`
    }
    case 'whisper':
      if (isMarkdown) {
        return showTimestamp ? `\`${range}\` ${unit.text}` : unit.text
      }
      return showTimestamp ? `[${range}]  ${unit.text}` : unit.text
    default:
      if (isMarkdown) {
        return showTimestamp ? `**${start}**\n\n${unit.text}` : unit.text
      }
      return showTimestamp ? `${start}\n${unit.text}` : unit.text
  }
}

/**
 * Build the plain-text export preview for the selected style and options.
 * @example buildTranscriptExportText
 * @category utilities
 * @since 0.0.0
 */
export const buildTranscriptExportText = (input: BuildTranscriptExportInput): string => {
  const units = buildExportUnitsBody(input.segments, input.grouping)
  if (input.style === 'video' || input.format === 'srt') {
    return buildSrtDocument(units)
  }
  return A.join(
    Sparse.map({
      items: units,
      map: (unit, index) => renderUnit(unit, index, input)
    }),
    '\n\n'
  )
}

/**
 * Pick the container extension for a video-and-subtitle export.
 * @example videoEncodeExtension
 * @category utilities
 * @since 0.0.0
 */
export const videoEncodeExtension = (mode: TranscriptVideoEncode): 'mkv' | 'mp4' =>
  mode === 'soft' ? 'mkv' : 'mp4'

/**
 * Turn a media title into a safe export file name.
 *
 * @param title Media title.
 * @param format File extension without a leading dot.
 * @param viaVidBee Append `via VidBee` before the extension. Used for subtitle exports.
 */
function buildTranscriptExportFileNameBody(
  title: string,
  format: TranscriptExportFileExtension = 'txt',
  viaVidBee = false
): string {
  const base = Str.slice(
    0,
    80
  )(Str.replace(/\s+/g, ' ')(Str.replace(/[<>:"/\\|?*]/g, '_')(Str.trim(title))))
  const name = `${base || 'transcript'}.${format}`
  return viaVidBee ? applyViaVidBeeFilename(name) : name
}

/**
 * Default file name for muxing or burning captions into a video.
 *
 * @param title Media title.
 * @param mode Soft mux or hard burn.
 */
function buildVideoSubtitleExportFileNameBody(title: string, mode: TranscriptVideoEncode): string {
  const suffix = mode === 'soft' ? 'subs' : 'burned'
  return buildTranscriptExportFileNameBody(`${title} ${suffix}`, videoEncodeExtension(mode), true)
}

/** TranscriptExportStyle shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptExportStyle input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptExportStyle } from './transcript-export.js'
 * strictEqual(S.is(TranscriptExportStyle)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExportStyle = LiteralKit([
  'transcript',
  'subtitles',
  'segments',
  'whisper',
  'video'
]).pipe(
  $I.annoteSchema('TranscriptExportStyle', {
    description: 'TranscriptExportStyle shared boundary data.'
  })
)
/** Decoded mutable TranscriptExportStyle data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptExportStyle
 */
export type TranscriptExportStyle = typeof TranscriptExportStyle.Type

/** TranscriptExportFormat shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptExportFormat input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptExportFormat } from './transcript-export.js'
 * strictEqual(S.is(TranscriptExportFormat)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExportFormat = LiteralKit(['txt', 'md', 'srt']).pipe(
  $I.annoteSchema('TranscriptExportFormat', {
    description: 'TranscriptExportFormat shared boundary data.'
  })
)
/** Decoded mutable TranscriptExportFormat data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptExportFormat
 */
export type TranscriptExportFormat = typeof TranscriptExportFormat.Type

/** TranscriptVideoEncode shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptVideoEncode input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptVideoEncode } from './transcript-export.js'
 * strictEqual(S.is(TranscriptVideoEncode)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptVideoEncode = LiteralKit(['soft', 'hard']).pipe(
  $I.annoteSchema('TranscriptVideoEncode', {
    description: 'TranscriptVideoEncode shared boundary data.'
  })
)
/** Decoded mutable TranscriptVideoEncode data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptVideoEncode
 */
export type TranscriptVideoEncode = typeof TranscriptVideoEncode.Type

/** TranscriptExportGrouping shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptExportGrouping input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptExportGrouping } from './transcript-export.js'
 * strictEqual(S.is(TranscriptExportGrouping)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExportGrouping = LiteralKit(['none', 'words', 'sentences']).pipe(
  $I.annoteSchema('TranscriptExportGrouping', {
    description: 'TranscriptExportGrouping shared boundary data.'
  })
)
/** Decoded mutable TranscriptExportGrouping data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptExportGrouping
 */
export type TranscriptExportGrouping = typeof TranscriptExportGrouping.Type

/** TranscriptExportFileExtension shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptExportFileExtension input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptExportFileExtension } from './transcript-export.js'
 * strictEqual(S.is(TranscriptExportFileExtension)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExportFileExtension = S.Union([
  TranscriptExportFormat,
  S.Literal('mkv'),
  S.Literal('mp4')
]).pipe(
  $I.annoteSchema('TranscriptExportFileExtension', {
    description: 'TranscriptExportFileExtension shared boundary data.'
  })
)
/** Decoded mutable TranscriptExportFileExtension data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptExportFileExtension
 */
export type TranscriptExportFileExtension = typeof TranscriptExportFileExtension.Type

/** TranscriptExportSegment shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptExportSegment input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptExportSegment } from './transcript-export.js'
 * strictEqual(S.is(TranscriptExportSegment)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExportSegment = S.Struct({
  endMs: S.Finite.pipe(S.mutableKey),
  speakerId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  startMs: S.Finite.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('TranscriptExportSegment', {
    description: 'TranscriptExportSegment shared boundary data.'
  })
)
/** Decoded mutable TranscriptExportSegment data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptExportSegment
 */
export type TranscriptExportSegment = typeof TranscriptExportSegment.Type

/** TranscriptExportUnit shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TranscriptExportUnit input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TranscriptExportUnit } from './transcript-export.js'
 * strictEqual(S.is(TranscriptExportUnit)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptExportUnit = S.Struct({
  endMs: S.Finite.pipe(S.mutableKey),
  speakerId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  startMs: S.Finite.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('TranscriptExportUnit', {
    description: 'TranscriptExportUnit shared boundary data.'
  })
)
/** Decoded mutable TranscriptExportUnit data.
 * @category type-level
 * @since 0.0.0
 * @example TranscriptExportUnit
 */
export type TranscriptExportUnit = typeof TranscriptExportUnit.Type

/** Record contract for buildExportUnits.
 * @category ports
 * @since 0.0.0
 * @example BuildExportUnitsInput
 */
export interface BuildExportUnitsInput {
  segments: TranscriptExportSegment[]
  grouping: TranscriptExportGrouping
}
/** buildExportUnits with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example buildExportUnits
 */
export const buildExportUnits: {
  (): (input: BuildExportUnitsInput) => TranscriptExportUnit[]
  (input: BuildExportUnitsInput): TranscriptExportUnit[]
} = recordFunction((input: BuildExportUnitsInput): TranscriptExportUnit[] =>
  buildExportUnitsBody(input.segments, input.grouping)
)
/** Record contract for buildTranscriptExportFileName.
 * @category ports
 * @since 0.0.0
 * @example BuildTranscriptExportFileNameInput
 */
export interface BuildTranscriptExportFileNameInput {
  title: string
  format?: TranscriptExportFileExtension | undefined
  viaVidBee?: boolean | undefined
}
/** buildTranscriptExportFileName with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example buildTranscriptExportFileName
 */
export const buildTranscriptExportFileName: {
  (): (input: BuildTranscriptExportFileNameInput) => string
  (input: BuildTranscriptExportFileNameInput): string
} = recordFunction((input: BuildTranscriptExportFileNameInput): string =>
  buildTranscriptExportFileNameBody(input.title, input.format, input.viaVidBee)
)
/** Record contract for buildVideoSubtitleExportFileName.
 * @category ports
 * @since 0.0.0
 * @example BuildVideoSubtitleExportFileNameInput
 */
export interface BuildVideoSubtitleExportFileNameInput {
  title: string
  mode: TranscriptVideoEncode
}
/** buildVideoSubtitleExportFileName with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example buildVideoSubtitleExportFileName
 */
export const buildVideoSubtitleExportFileName: {
  (): (input: BuildVideoSubtitleExportFileNameInput) => string
  (input: BuildVideoSubtitleExportFileNameInput): string
} = recordFunction((input: BuildVideoSubtitleExportFileNameInput): string =>
  buildVideoSubtitleExportFileNameBody(input.title, input.mode)
)
