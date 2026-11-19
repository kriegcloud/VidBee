import { classifyWithDateParser, getRuleForCategory as getRuleKernel, parseRetryAfterWithDateParser } from '@vidbee/task-queue/classifier'
import type { ClassifyInput } from '@vidbee/task-queue/Classifier.model'
import type { ClassifiedError, ErrorCategory } from '../types.js'
export { CLASSIFIER_RULES, sanitizeOutput } from '@vidbee/task-queue/classifier'
export type { ClassifyInput }
export function classify(input: ClassifyInput) {
  return classifyWithDateParser(input, Date.now(), Date.parse)
}
export function parseRetryAfter(header: string | null | undefined) { return parseRetryAfterWithDateParser(header, Date.now(), Date.parse) }
export function takeStderrTail(s: string, bytes = 8 * 1024): string {
  while (Buffer.byteLength(s, 'utf8') > bytes) s = s.slice(Math.floor(s.length * 0.1))
  return s
}
export function getRuleForCategory(category: ErrorCategory) {
  try { return getRuleKernel(category) } catch { throw new Error(`no rule for category ${category}`) }
}
export function virtualError(category: ErrorCategory, rawMessage: string): ClassifiedError {
  const rule = getRuleForCategory(category)
  return { category, exitCode: null, rawMessage, uiMessageKey: rule.uiMessageKey, uiActionHints: rule.uiActionHints, retryable: rule.defaultMaxAttempts > 0, suggestedRetryAfterMs: rule.defaultBackoffMs }
}
export function defaultMaxAttempts(category: ErrorCategory): number { return getRuleForCategory(category).defaultMaxAttempts }
