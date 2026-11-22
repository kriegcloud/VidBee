import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import { parseAssCues, parseCaptionCues } from '@vidbee/transcription/captions'
import * as A from 'effect/Array'
import { dual, pipe } from 'effect/Function'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

const $I = $DesktopId.create('shared/extension-transcript')

/** Start a Desktop caption extract for the current watch URL. */

/** Public caption result; local file paths stay in Desktop. */

/** A short-lived capability grants access to only this caption extract. */

/** Read the language tag and format from a yt-dlp caption sidecar name.
 *
 * **Example** (Access the parseCaptionSidecarName contract)
 *
 * ```ts
 * import { parseCaptionSidecarName } from './extension-transcript.js'
 * void parseCaptionSidecarName
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function parseCaptionSidecarName(fileName: string): {
  auto: boolean
  format: CaptionSidecarFormat
  language: string
} | null {
  const match = pipe(
    fileName,
    Str.match(/^[^/\\]+?\.([A-Za-z0-9][A-Za-z0-9-]*)\.(vtt|srt|ass|json3)$/i),
    O.getOrUndefined
  )
  if (
    match === undefined ||
    match[1] === undefined ||
    match[1].length === 0 ||
    match[2] === undefined ||
    match[2].length === 0
  ) {
    return null
  }
  const language = match[1]
  const format = Str.toLowerCase(match[2])
  if (!S.is(CaptionSidecarFormat)(format)) {
    return null
  }
  const auto = /(?:^|-)(?:ai|auto|orig)(?:-|$)/i.test(language)
  return {
    auto,
    format,
    language
  }
}

/** Parse JSON3, WebVTT, SRT, or ASS caption text into timed cues.
 *
 * **Example** (Access the captionCuesFromPayload contract)
 *
 * ```ts
 * import { captionCuesFromPayload } from './extension-transcript.js'
 * void captionCuesFromPayload
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const captionCuesFromPayload: {
  (
    format: CaptionSidecarFormat
  ): (text: string) => Array<{
    endMs: number
    startMs: number
    text: string
  }>
  (
    text: string,
    format: CaptionSidecarFormat
  ): Array<{
    endMs: number
    startMs: number
    text: string
  }>
} = dual(
  2,
  (
    text: string,
    format: CaptionSidecarFormat
  ): Array<{
    endMs: number
    startMs: number
    text: string
  }> => {
    if (format === 'json3') {
      return readJson3Cues(text)
    }
    const cues = format === 'ass' ? parseAssCues(text) : parseCaptionCues(text)
    return A.map(cues, (cue) => ({
      endMs: cue.endMs,
      startMs: cue.startMs,
      text: cue.text
    }))
  }
)

/** Pick the requested track, otherwise a human track, otherwise the first.
 *
 * **Example** (Access the pickExtensionCaptionTrack contract)
 *
 * ```ts
 * import { pickExtensionCaptionTrack } from './extension-transcript.js'
 * void pickExtensionCaptionTrack
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function pickExtensionCaptionTrack<
  T extends {
    auto: boolean
    id: string
    language: string
  }
>(): (input: { tracks: T[]; requested?: string | undefined }) => T | undefined
/** pickExtensionCaptionTrack shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the pickExtensionCaptionTrack contract)
 *
 * ```ts
 * import { pickExtensionCaptionTrack } from './extension-transcript.js'
 * void pickExtensionCaptionTrack
 * ```
 *
 */
export function pickExtensionCaptionTrack<
  T extends {
    auto: boolean
    id: string
    language: string
  }
>(input: { tracks: T[]; requested?: string | undefined }): T | undefined
/** pickExtensionCaptionTrack shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the pickExtensionCaptionTrack contract)
 *
 * ```ts
 * import { pickExtensionCaptionTrack } from './extension-transcript.js'
 * void pickExtensionCaptionTrack
 * ```
 *
 */
export function pickExtensionCaptionTrack<
  T extends {
    auto: boolean
    id: string
    language: string
  }
>(input?: {
  tracks: T[]
  requested?: string | undefined
}): T | undefined | ((input: { tracks: T[]; requested?: string | undefined }) => T | undefined) {
  if (input === undefined) {
    return (next) => pickExtensionCaptionTrack(next)
  }
  const { tracks, requested } = input
  const hasRequested = P.isTruthy(requested)
  if (hasRequested) {
    return (
      pipe(
        tracks,
        A.findFirst((track) => track.id === requested),
        O.getOrUndefined
      ) ??
      pipe(
        tracks,
        A.findFirst((track) => track.language === requested),
        O.getOrUndefined
      )
    )
  }
  return (
    pipe(
      tracks,
      A.findFirst((track) => !track.auto),
      O.getOrUndefined
    ) ?? tracks[0]
  )
}

/** Map yt-dlp caption-extract stderr onto the extension's transcript error codes.
 *
 * **Example** (Access the classifyCaptionExtractError contract)
 *
 * ```ts
 * import { classifyCaptionExtractError } from './extension-transcript.js'
 * void classifyCaptionExtractError
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function classifyCaptionExtractError(stderr: string): ExtensionTranscriptErrorCode {
  if (
    /no subtitles|doesn't have subtitles|does not have subtitles|subtitles for the requested languages/i.test(
      stderr
    )
  ) {
    return 'noCaptions'
  }
  if (
    /private video|sign in|login required|unavailable|not available|has been removed/i.test(stderr)
  ) {
    return 'unavailable'
  }
  if (
    /http error 403|blocked|po token|confirm you’re not a bot|confirm you're not a bot/i.test(
      stderr
    )
  ) {
    return 'blocked'
  }
  return 'network'
}

/** Parse YouTube JSON3 caption events without speaker metadata. */
function readJson3Cues(text: string): Array<{
  endMs: number
  startMs: number
  text: string
}> {
  try {
    const decoded = S.decodeOption(S.fromJsonString(S.Unknown))(text)
    if (O.isNone(decoded) || !P.isObject(decoded.value) || !A.isArray(decoded.value.events)) {
      return []
    }
    const payload = decoded.value.events
    const cues: Array<{
      endMs: number
      startMs: number
      text: string
    }> = []
    for (const event of payload) {
      if (event === null || event === undefined) {
        return []
      }
      if (!(P.isObject(event) && A.isArray(event.segs))) {
        continue
      }
      const pieces: string[] = []
      for (const segment of event.segs) {
        if (segment === null || segment === undefined) {
          return []
        }
        pieces.push(P.isObject(segment) ? String(segment.utf8 ?? '') : '')
      }
      const caption = pipe(pieces, A.join(''), Str.replace(/\s+/g, ' '), Str.trim)
      const startMs = Number(event.tStartMs)
      if (caption.length === 0 || !Number.isFinite(startMs)) {
        continue
      }
      cues.push({
        endMs: startMs + Number(P.isTruthy(event.dDurationMs) ? event.dDurationMs : 2000),
        startMs,
        text: caption
      })
    }
    return cues
  } catch {
    return []
  }
}

/** ExtensionTranscriptStatus shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptStatus input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptStatus } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptStatus)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptStatus = LiteralKit(['running', 'completed', 'error']).pipe(
  $I.annoteSchema('ExtensionTranscriptStatus', {
    description: 'ExtensionTranscriptStatus shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptStatus data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptStatus contract)
 *
 * ```ts
 * import { ExtensionTranscriptStatus } from './extension-transcript.js'
 * void ExtensionTranscriptStatus
 * ```
 *
 */
export type ExtensionTranscriptStatus = typeof ExtensionTranscriptStatus.Type

/** ExtensionTranscriptErrorCode shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptErrorCode input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptErrorCode } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptErrorCode)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptErrorCode = LiteralKit([
  'noCaptions',
  'unavailable',
  'blocked',
  'network'
]).pipe(
  $I.annoteSchema('ExtensionTranscriptErrorCode', {
    description: 'ExtensionTranscriptErrorCode shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptErrorCode data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptErrorCode contract)
 *
 * ```ts
 * import { ExtensionTranscriptErrorCode } from './extension-transcript.js'
 * void ExtensionTranscriptErrorCode
 * ```
 *
 */
export type ExtensionTranscriptErrorCode = typeof ExtensionTranscriptErrorCode.Type

/** ExtensionTranscriptInput shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptInput } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptInput = S.Struct({
  requestId: S.String.pipe(S.mutableKey),
  sourceUrl: S.String.pipe(S.mutableKey),
  language: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  refresh: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionTranscriptInput', {
    description: 'ExtensionTranscriptInput shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptInput contract)
 *
 * ```ts
 * import { ExtensionTranscriptInput } from './extension-transcript.js'
 * void ExtensionTranscriptInput
 * ```
 *
 */
export type ExtensionTranscriptInput = typeof ExtensionTranscriptInput.Type

/** ExtensionTranscriptSegment shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptSegment input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptSegment } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptSegment)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptSegment = S.Struct({
  start: S.Finite.pipe(S.mutableKey),
  end: S.Finite.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionTranscriptSegment', {
    description: 'ExtensionTranscriptSegment shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptSegment data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptSegment contract)
 *
 * ```ts
 * import { ExtensionTranscriptSegment } from './extension-transcript.js'
 * void ExtensionTranscriptSegment
 * ```
 *
 */
export type ExtensionTranscriptSegment = typeof ExtensionTranscriptSegment.Type

/** ExtensionTranscriptTrack shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptTrack input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptTrack } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptTrack)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptTrack = S.Struct({
  id: S.String.pipe(S.mutableKey),
  language: S.String.pipe(S.mutableKey),
  label: S.String.pipe(S.mutableKey),
  auto: S.Boolean.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionTranscriptTrack', {
    description: 'ExtensionTranscriptTrack shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptTrack data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptTrack contract)
 *
 * ```ts
 * import { ExtensionTranscriptTrack } from './extension-transcript.js'
 * void ExtensionTranscriptTrack
 * ```
 *
 */
export type ExtensionTranscriptTrack = typeof ExtensionTranscriptTrack.Type

/** ExtensionTranscriptSnapshot shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptSnapshot input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptSnapshot } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptSnapshot)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptSnapshot = S.Struct({
  status: ExtensionTranscriptStatus.pipe(S.mutableKey),
  error: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  errorCode: S.Union([ExtensionTranscriptErrorCode, S.Null]).pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  author: S.String.pipe(S.mutableKey),
  duration: S.Finite.pipe(S.mutableKey),
  tracks: S.Array(ExtensionTranscriptTrack).pipe(S.mutable, S.mutableKey),
  selectedTrackId: S.String.pipe(S.mutableKey),
  segments: S.Array(ExtensionTranscriptSegment).pipe(S.mutable, S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionTranscriptSnapshot', {
    description: 'ExtensionTranscriptSnapshot shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptSnapshot data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptSnapshot contract)
 *
 * ```ts
 * import { ExtensionTranscriptSnapshot } from './extension-transcript.js'
 * void ExtensionTranscriptSnapshot
 * ```
 *
 */
export type ExtensionTranscriptSnapshot = typeof ExtensionTranscriptSnapshot.Type

/** ExtensionTranscriptJob shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionTranscriptJob input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionTranscriptJob } from './extension-transcript.js'
 * strictEqual(S.is(ExtensionTranscriptJob)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionTranscriptJob = S.Struct({
  id: S.String.pipe(S.mutableKey),
  token: S.String.pipe(S.mutableKey),
  snapshot: ExtensionTranscriptSnapshot.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionTranscriptJob', {
    description: 'ExtensionTranscriptJob shared boundary data.'
  })
)
/** Decoded mutable ExtensionTranscriptJob data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ExtensionTranscriptJob contract)
 *
 * ```ts
 * import { ExtensionTranscriptJob } from './extension-transcript.js'
 * void ExtensionTranscriptJob
 * ```
 *
 */
export type ExtensionTranscriptJob = typeof ExtensionTranscriptJob.Type

/** CaptionSidecarFormat shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid CaptionSidecarFormat input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { CaptionSidecarFormat } from './extension-transcript.js'
 * strictEqual(S.is(CaptionSidecarFormat)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CaptionSidecarFormat = LiteralKit(['ass', 'json3', 'srt', 'vtt']).pipe(
  $I.annoteSchema('CaptionSidecarFormat', {
    description: 'CaptionSidecarFormat shared boundary data.'
  })
)
/** Decoded mutable CaptionSidecarFormat data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the CaptionSidecarFormat contract)
 *
 * ```ts
 * import { CaptionSidecarFormat } from './extension-transcript.js'
 * void CaptionSidecarFormat
 * ```
 *
 */
export type CaptionSidecarFormat = typeof CaptionSidecarFormat.Type
