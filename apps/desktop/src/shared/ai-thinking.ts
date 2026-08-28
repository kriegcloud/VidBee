/** One row rendered inside ThinkingSteps. */
export interface PromptThinkingStep {
  description?: string
  label: string
}

const LABEL_MAX = 80

/**
 * Strip markdown / list markers so a chunk can become a short step label.
 *
 * @param line First line of a thinking chunk.
 */
const stripMarker = (line: string): string =>
  line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+?)\*\*:?\s*$/, '$1')
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)、]\s+/, '')
    .trim()

/**
 * Turn one thinking chunk into a label plus optional body.
 *
 * @param chunk Heading, paragraph, or numbered item.
 */
const toStep = (chunk: string): PromptThinkingStep => {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const first = stripMarker(lines[0] ?? '')
  const rest = lines.slice(1).join('\n').trim()
  if (rest) {
    return { label: first.slice(0, LABEL_MAX), description: rest }
  }
  if (first.length <= LABEL_MAX) {
    return { label: first }
  }
  return { label: `${first.slice(0, LABEL_MAX - 1)}…`, description: first }
}

/**
 * Split model thinking into step rows instead of dumping it as one markdown blob.
 *
 * @param thinking Raw thinking / reasoning text from the model.
 */
export const parseThinkingSteps = (thinking: string): PromptThinkingStep[] => {
  const text = thinking.trim()
  if (!text) {
    return []
  }

  const headingSplit = text
    .split(/(?=^#{1,6}\s+|^\*\*[^*\n]+\*\*:?\s*$)/m)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (headingSplit.length > 1) {
    return headingSplit.map(toStep)
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (paragraphs.length > 1) {
    return paragraphs.map(toStep)
  }

  const numbered = text
    .split(/(?=^\d+[.)、]\s+)/m)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (numbered.length > 1) {
    return numbered.map(toStep)
  }

  return [toStep(text)]
}

/**
 * True when thinking is just the answer dumped into a thinking block.
 *
 * @param thinking Reasoning text.
 * @param text Visible assistant text.
 */
export const isThinkingSameAsAnswer = (thinking: string, text: string): boolean => {
  const nextThinking = thinking.trim()
  const nextText = text.trim()
  return nextThinking.length > 0 && nextThinking === nextText
}
