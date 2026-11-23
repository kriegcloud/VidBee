import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import { dual } from 'effect/Function'
import * as Order from 'effect/Order'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import * as Sparse from './ArrayHelpers.js'

const $I = $DesktopId.create('shared/subtitle-export')

/** Assign secondary cues to their strongest primary overlap, shared by bilingual reading and exports. */
const alignSubtitleCuesBody = (
  primary: readonly SubtitleCue[],
  secondary: readonly SubtitleCue[]
): string[] => {
  const rows = A.sort(
    Sparse.map({ items: primary, map: (cue, index) => ({ ...cue, index }) }),
    Order.make<SubtitleCue & { index: number }>((left, right) => {
      const difference = left.startMs - right.startMs
      return difference < 0 ? -1 : difference > 0 ? 1 : 0
    })
  )
  const result = Sparse.map({ items: primary, map: (): string[] => [] })
  for (const cue of A.sort(
    [...secondary],
    Order.make<SubtitleCue>((left, right) => {
      const difference = left.startMs - right.startMs
      return difference < 0 ? -1 : difference > 0 ? 1 : 0
    })
  )) {
    if (Str.trim(cue.text).length === 0) {
      continue
    }
    let best = -1
    let overlap = 0
    for (const row of rows) {
      if (row.startMs >= cue.endMs) {
        break
      }
      const shared = Math.min(row.endMs, cue.endMs) - Math.max(row.startMs, cue.startMs)
      if (shared > overlap) {
        best = row.index
        overlap = shared
      }
    }
    if (best >= 0) {
      for (const [index, lines] of result.entries()) {
        if (index === best && Sparse.at({ items: lines, index: -1 }) !== Str.trim(cue.text)) {
          lines.push(Str.trim(cue.text))
        }
      }
    }
  }
  return Sparse.map({ items: result, map: (lines) => A.join(lines, '\n') })
}
/** Align cue overlaps in data-first or pipeable form.
 *
 * **Example** (Access the alignSubtitleCues contract)
 *
 * ```ts
 * import { alignSubtitleCues } from './subtitle-export.js'
 * void alignSubtitleCues
 * ```
 *
 * @category rules
 * @since 0.0.0
 */
export const alignSubtitleCues: {
  (primary: readonly SubtitleCue[], secondary: readonly SubtitleCue[]): string[]
  (secondary: readonly SubtitleCue[]): (primary: readonly SubtitleCue[]) => string[]
} = dual(2, alignSubtitleCuesBody)

/** Format a cue timestamp as HH:MM:SS,mmm for SubRip and video exports.
 *
 * **Example** (Access the formatSrtClock contract)
 *
 * ```ts
 * import { formatSrtClock } from './subtitle-export.js'
 * void formatSrtClock
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function formatSrtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${Str.padStart(2, '0')(String(hours))}:${Str.padStart(2, '0')(String(minutes))}:${Str.padStart(2, '0')(String(seconds))},${Str.padStart(3, '0')(String(millis))}`
}

/** Build a SubRip document shared by interactive and MCP exports.
 *
 * **Example** (Access the buildSrtDocument contract)
 *
 * ```ts
 * import { buildSrtDocument } from './subtitle-export.js'
 * void buildSrtDocument
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function buildSrtDocument(units: SubtitleCue[]): string {
  return A.join(
    Sparse.map({
      items: units,
      map: (unit, index) =>
        `${index + 1}\n${formatSrtClock(unit.startMs)} --> ${formatSrtClock(unit.endMs)}\n${unit.text}`
    }),
    '\n\n'
  )
}

/** Build a WebVTT document shared by transcript exports and subtitle-only downloads.
 *
 * **Example** (Access the buildVttDocument contract)
 *
 * ```ts
 * import { buildVttDocument } from './subtitle-export.js'
 * void buildVttDocument
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function buildVttDocument(units: SubtitleCue[]): string {
  return `WEBVTT\n\n${A.join(
    Sparse.map({
      items: units,
      map: (unit) =>
        `${Str.replace(',', '.')(formatSrtClock(unit.startMs))} --> ${Str.replace(',', '.')(formatSrtClock(unit.endMs))}\n${unit.text}`
    }),
    '\n\n'
  )}`
}

/** Format an ASS timestamp using centisecond precision.
 *
 * **Example** (Access the formatAssClock contract)
 *
 * ```ts
 * import { formatAssClock } from './subtitle-export.js'
 * void formatAssClock
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function formatAssClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const centis = Math.floor((total % 1000) / 10)
  return `${hours}:${Str.padStart(2, '0')(String(minutes))}:${Str.padStart(2, '0')(String(seconds))}.${Str.padStart(2, '0')(String(centis))}`
}

/** Escape captions so libass cannot interpret user text as formatting commands.
 *
 * **Example** (Access the escapeAssText contract)
 *
 * ```ts
 * import { escapeAssText } from './subtitle-export.js'
 * void escapeAssText
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function escapeAssText(text: string): string {
  return Str.replaceAll(
    /\r?\n/g,
    '\\N'
  )(Str.replaceAll('}', '\\}')(Str.replaceAll('{', '\\{')(Str.replaceAll('\\', '\\\\')(text))))
}

/** Build the same ASS track for interactive and externally requested caption burn-in.
 *
 * **Example** (Access the buildAssDocument contract)
 *
 * ```ts
 * import { buildAssDocument } from './subtitle-export.js'
 * void buildAssDocument
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function buildAssDocument(units: SubtitleCue[]): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,80,80,64,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const events = Sparse.map({
    items: units,
    map: (unit) =>
      `Dialogue: 0,${formatAssClock(unit.startMs)},${formatAssClock(Math.max(unit.endMs, unit.startMs + 400))},Default,,0,0,0,,${escapeAssText(unit.text)}`
  })
  return A.join([...header, ...events], '\n')
}

/** SubtitleCue shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SubtitleCue input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubtitleCue } from './subtitle-export.js'
 * strictEqual(S.is(SubtitleCue)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubtitleCue = S.Struct({
  startMs: S.Finite.pipe(S.mutableKey),
  endMs: S.Finite.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('SubtitleCue', {
    description: 'SubtitleCue shared boundary data.'
  })
)
/** Decoded mutable SubtitleCue data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the SubtitleCue contract)
 *
 * ```ts
 * import { SubtitleCue } from './subtitle-export.js'
 * void SubtitleCue
 * ```
 *
 */
export type SubtitleCue = typeof SubtitleCue.Type
