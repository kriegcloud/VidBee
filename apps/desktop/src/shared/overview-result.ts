import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import * as O from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { parsePromptClock } from './ai-prompt-text'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/overview-result')
const LIST_ITEM = /^(?:[-*]|\d+[.)])\s+(?:\*\*)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\*\*)?\s+(.*)$/u
const HEADING = /^(#{1,3})\s+(.+?)\s*$/u
const FENCE = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/u

/**
 * True when the model returned at least one Overview field we can lay out.
 *
 * @param parsed Structured Overview.
 *
 * **Example** (Access the hasOverviewStructure contract)
 *
 * ```ts
 * import { hasOverviewStructure } from './overview-result.js'
 * void hasOverviewStructure
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const hasOverviewStructure = (parsed: ParsedOverview): boolean =>
  parsed.chapters.length > 0 || parsed.quotes.length > 0

/**
 * Locate the chapter that contains playback and how far that chapter has run.
 *
 * @param chapters Parsed Overview chapters in timeline order.
 * @param currentSeconds Player current time.
 * @param durationSeconds Media duration when known; ends the last chapter.
 */
function overviewPlayheadBody(
  chapters: readonly OverviewChapter[],
  currentSeconds: number,
  durationSeconds = 0
): OverviewPlayhead {
  if (chapters.length === 0) {
    return {
      index: -1,
      progress: 0
    }
  }
  let index = -1
  for (const [i, chapter] of chapters.entries()) {
    if (currentSeconds >= chapter.seconds) {
      index = i
      continue
    }
    break
  }
  if (index < 0) {
    return {
      index: -1,
      progress: 0
    }
  }
  const start = chapters[index]?.seconds ?? 0
  const next = chapters[index + 1]?.seconds
  if (next === undefined && durationSeconds <= start) {
    return {
      index,
      progress: 0
    }
  }
  const end = next ?? durationSeconds
  const span = end - start
  if (span <= 0) {
    return {
      index,
      progress: currentSeconds >= start ? 1 : 0
    }
  }
  return {
    index,
    progress: Math.min(1, Math.max(0, (currentSeconds - start) / span))
  }
}

/**
 * Map a section heading onto chapters, quotes, or neither.
 *
 * @param heading Markdown heading text.
 */
const classifyOverviewHeading = (heading: string): 'chapters' | 'quotes' | 'other' => {
  const text = Str.trim(heading)
  if (/quote|金句|引言|引用|名言|zitat|citation|cita/i.test(text)) {
    return 'quotes'
  }
  if (/chapter|章节|章節|チャプター|챕터|chapitre|kapitel|capítulo|capitolo/i.test(text)) {
    return 'chapters'
  }
  return 'other'
}

/**
 * Split a chapter line into title and optional summary after an em/en dash.
 *
 * @param rest Text after the clock token.
 */
const splitChapterCopy = (
  rest: string
): {
  summary: string
  title: string
} => {
  const parts = Str.split(/\s+[—–]\s+/)(rest)
  const title = Str.trim(parts[0] ?? '')
  const summary = Str.trim(A.join(parts.slice(1), ' — '))
  return {
    summary,
    title
  }
}

/**
 * Strip wrapping quotation marks from a key quote.
 *
 * @param value Quote body from the model.
 */
const unwrapQuote = (value: string): string =>
  Str.trim(
    Str.replace(/(?:["”»」』]|'{2})$/, '')(Str.replace(/^(?:["“«「『]|'{2})/, '')(Str.trim(value)))
  )

/**
 * True when the remainder of a list item looks like a spoken quote.
 *
 * @param rest Text after the clock token.
 */
const looksLikeQuote = (rest: string): boolean => /^\s*["“«「『]/.test(rest)

/**
 * Parse Overview markdown into a takeaway, chapters, and key quotes.
 *
 * @param markdown Raw prompt result, possibly still streaming.
 *
 * **Example** (Access the parseOverviewMarkdown contract)
 *
 * ```ts
 * import { parseOverviewMarkdown } from './overview-result.js'
 * void parseOverviewMarkdown
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const parseOverviewMarkdown = (markdown: string): ParsedOverview => {
  const source = Str.replace(FENCE, '$1')(Str.trim(markdown))
  const parsed: ParsedOverview = {
    chapters: [],
    quotes: [],
    takeaway: ''
  }
  let section: 'lead' | 'chapters' | 'quotes' = 'lead'
  for (const rawLine of Str.split(/\r?\n/)(source)) {
    const line = Str.trim(rawLine)
    if (line.length === 0) {
      continue
    }
    const heading = O.getOrNull(Str.match(HEADING)(line))
    if (heading !== null) {
      const depth = heading[1]?.length ?? 0
      const title =
        (heading[2] === undefined || heading[2] === null ? undefined : Str.trim(heading[2])) ?? ''
      if (
        depth === 1 &&
        parsed.takeaway.length === 0 &&
        classifyOverviewHeading(title) === 'other'
      ) {
        parsed.takeaway = title
      }
      const kind = classifyOverviewHeading(title)
      if (kind === 'chapters' || kind === 'quotes') {
        section = kind
      }
      continue
    }
    const item = O.getOrNull(Str.match(LIST_ITEM)(line))
    if (item === null) {
      continue
    }
    const clock = item[1] ?? ''
    const seconds = parsePromptClock(clock)
    if (seconds === null) {
      continue
    }
    const rest = Str.trim(item[2] ?? '')
    if (rest.length === 0) {
      continue
    }
    const asQuote = section === 'quotes' || (section === 'lead' && looksLikeQuote(rest))
    if (asQuote) {
      parsed.quotes.push({
        clock,
        quote: unwrapQuote(rest),
        seconds
      })
      continue
    }
    const { summary, title } = splitChapterCopy(rest)
    if (title.length === 0) {
      continue
    }
    parsed.chapters.push({
      clock,
      seconds,
      summary,
      title
    })
    if (section === 'lead') {
      section = 'chapters'
    }
  }
  return parsed
}

/** OverviewChapter shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid OverviewChapter input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { OverviewChapter } from './overview-result.js'
 * strictEqual(S.is(OverviewChapter)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const OverviewChapter = S.Struct({
  clock: S.String.pipe(S.mutableKey),
  seconds: S.Finite.pipe(S.mutableKey),
  summary: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('OverviewChapter', {
    description: 'OverviewChapter shared boundary data.'
  })
)
/** Decoded mutable OverviewChapter data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the OverviewChapter contract)
 *
 * ```ts
 * import { OverviewChapter } from './overview-result.js'
 * void OverviewChapter
 * ```
 *
 */
export type OverviewChapter = typeof OverviewChapter.Type

/** OverviewQuote shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid OverviewQuote input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { OverviewQuote } from './overview-result.js'
 * strictEqual(S.is(OverviewQuote)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const OverviewQuote = S.Struct({
  clock: S.String.pipe(S.mutableKey),
  seconds: S.Finite.pipe(S.mutableKey),
  quote: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('OverviewQuote', {
    description: 'OverviewQuote shared boundary data.'
  })
)
/** Decoded mutable OverviewQuote data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the OverviewQuote contract)
 *
 * ```ts
 * import { OverviewQuote } from './overview-result.js'
 * void OverviewQuote
 * ```
 *
 */
export type OverviewQuote = typeof OverviewQuote.Type

/** ParsedOverview shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ParsedOverview input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ParsedOverview } from './overview-result.js'
 * strictEqual(S.is(ParsedOverview)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ParsedOverview = S.Struct({
  chapters: S.Array(OverviewChapter).pipe(S.mutable, S.mutableKey),
  quotes: S.Array(OverviewQuote).pipe(S.mutable, S.mutableKey),
  takeaway: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ParsedOverview', {
    description: 'ParsedOverview shared boundary data.'
  })
)
/** Decoded mutable ParsedOverview data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the ParsedOverview contract)
 *
 * ```ts
 * import { ParsedOverview } from './overview-result.js'
 * void ParsedOverview
 * ```
 *
 */
export type ParsedOverview = typeof ParsedOverview.Type

/** OverviewPlayhead shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid OverviewPlayhead input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { OverviewPlayhead } from './overview-result.js'
 * strictEqual(S.is(OverviewPlayhead)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const OverviewPlayhead = S.Struct({
  index: S.Finite.pipe(S.mutableKey),
  progress: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('OverviewPlayhead', {
    description: 'OverviewPlayhead shared boundary data.'
  })
)
/** Decoded mutable OverviewPlayhead data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the OverviewPlayhead contract)
 *
 * ```ts
 * import { OverviewPlayhead } from './overview-result.js'
 * void OverviewPlayhead
 * ```
 *
 */
export type OverviewPlayhead = typeof OverviewPlayhead.Type

/** Record contract for overviewPlayhead. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the OverviewPlayheadInput contract)
 *
 * ```ts
 * import { OverviewPlayheadInput } from './overview-result.js'
 * void OverviewPlayheadInput
 * ```
 *
 */
export const OverviewPlayheadInput = S.Struct({
  chapters: OverviewChapter.pipe(S.Array, S.mutableKey),
  currentSeconds: S.mutableKey(S.Finite),
  durationSeconds: S.Union([S.Finite, S.Undefined]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('OverviewPlayheadInput', {
    description:
      'Explicit input record for OverviewPlayheadInput; structural for legacy construction.'
  })
)
/** Schema-derived OverviewPlayheadInput input.
 * @category type-level
 * @since 0.0.0
 */
export type OverviewPlayheadInput = typeof OverviewPlayheadInput.Type
/** overviewPlayhead with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the overviewPlayhead contract)
 *
 * ```ts
 * import { overviewPlayhead } from './overview-result.js'
 * void overviewPlayhead
 * ```
 *
 */
export const overviewPlayhead: {
  (): (input: OverviewPlayheadInput) => OverviewPlayhead
  (input: OverviewPlayheadInput): OverviewPlayhead
} = recordFunction(
  (input: OverviewPlayheadInput): OverviewPlayhead =>
    overviewPlayheadBody(input.chapters, input.currentSeconds, input.durationSeconds)
)
