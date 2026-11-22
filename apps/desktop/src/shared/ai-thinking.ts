import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import { dual } from 'effect/Function'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import * as Sparse from './ArrayHelpers.js'

const $I = $DesktopId.create('shared/ai-thinking')
/** One row rendered inside ThinkingSteps. */

const LABEL_MAX = 80

/**
 * Strip markdown / list markers so a chunk can become a short step label.
 *
 * @param line First line of a thinking chunk.
 */
const stripMarker = (line: string): string =>
  Str.trim(
    Str.replace(
      /^\d+[.)、]\s+/,
      ''
    )(
      Str.replace(
        /^[-*•]\s+/,
        ''
      )(Str.replace(/^\*\*(.+?)\*\*:?\s*$/, '$1')(Str.replace(/^#{1,6}\s+/, '')(line)))
    )
  )

/**
 * Turn one thinking chunk into a label plus optional body.
 *
 * @param chunk Heading, paragraph, or numbered item.
 */
const toStep = (chunk: string): PromptThinkingStep => {
  const lines = Sparse.filter({
    items: Sparse.map({
      items: Str.split('\n')(chunk),
      map: (line) => Str.trim(line)
    }),
    predicate: (line) => line.length > 0
  })
  const first = stripMarker(lines[0] ?? '')
  const rest = Str.trim(A.join(lines.slice(1), '\n'))
  if (rest.length > 0) {
    return {
      label: Str.slice(0, LABEL_MAX)(first),
      description: rest
    }
  }
  if (first.length <= LABEL_MAX) {
    return {
      label: first
    }
  }
  return {
    label: `${Str.slice(0, LABEL_MAX - 1)(first)}…`,
    description: first
  }
}

/**
 * Split model thinking into step rows instead of dumping it as one markdown blob.
 *
 * @param thinking Raw thinking / reasoning text from the model.
 *
 * **Example** (Access the parseThinkingSteps contract)
 *
 * ```ts
 * import { parseThinkingSteps } from './ai-thinking.js'
 * void parseThinkingSteps
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const parseThinkingSteps = (thinking: string): PromptThinkingStep[] => {
  const text = Str.trim(thinking)
  if (text.length === 0) {
    return []
  }
  const headingSplit = Sparse.filter({
    items: Sparse.map({
      items: Str.split(/(?=^#{1,6}\s+|^\*\*[^*\n]+\*\*:?\s*$)/m)(text),
      map: (part) => Str.trim(part)
    }),
    predicate: (part) => part.length > 0
  })
  if (headingSplit.length > 1) {
    return Sparse.map({
      items: headingSplit,
      map: toStep
    })
  }
  const paragraphs = Sparse.filter({
    items: Sparse.map({
      items: Str.split(/\n{2,}/)(text),
      map: (part) => Str.trim(part)
    }),
    predicate: (part) => part.length > 0
  })
  if (paragraphs.length > 1) {
    return Sparse.map({
      items: paragraphs,
      map: toStep
    })
  }
  const numbered = Sparse.filter({
    items: Sparse.map({
      items: Str.split(/(?=^\d+[.)、]\s+)/m)(text),
      map: (part) => Str.trim(part)
    }),
    predicate: (part) => part.length > 0
  })
  if (numbered.length > 1) {
    return Sparse.map({
      items: numbered,
      map: toStep
    })
  }
  return [toStep(text)]
}

/**
 * True when thinking is just the answer dumped into a thinking block.
 *
 * @param thinking Reasoning text.
 * @param text Visible assistant text.
 */
const isThinkingSameAsAnswerBody = (thinking: string, text: string): boolean => {
  const nextThinking = Str.trim(thinking)
  const nextText = Str.trim(text)
  return nextThinking.length > 0 && nextThinking === nextText
}

/** PromptThinkingStep shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid PromptThinkingStep input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PromptThinkingStep } from './ai-thinking.js'
 * strictEqual(S.is(PromptThinkingStep)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptThinkingStep = S.Struct({
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  label: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('PromptThinkingStep', {
    description: 'PromptThinkingStep shared boundary data.'
  })
)
/** Decoded mutable PromptThinkingStep data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PromptThinkingStep contract)
 *
 * ```ts
 * import { PromptThinkingStep } from './ai-thinking.js'
 * void PromptThinkingStep
 * ```
 *
 */
export type PromptThinkingStep = typeof PromptThinkingStep.Type
/** Data-first and pipeable isThinkingSameAsAnswer.
 *
 * **Example** (Access the isThinkingSameAsAnswer contract)
 *
 * ```ts
 * import { isThinkingSameAsAnswer } from './ai-thinking.js'
 * void isThinkingSameAsAnswer
 * ```
 *
 * @category rules
 * @since 0.0.0
 */
export const isThinkingSameAsAnswer: {
  (thinking: string, text: string): boolean
  (text: string): (value: string) => boolean
} = dual(2, isThinkingSameAsAnswerBody)
