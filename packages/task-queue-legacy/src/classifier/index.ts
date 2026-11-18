import { classify as classifyKernel, getRuleForCategory as getRuleKernel, parseRetryAfter as parseRetryAfterKernel } from '@vidbee/task-queue/classifier'
import type { ClassifyInput } from '@vidbee/task-queue/Classifier.model'
export { CLASSIFIER_RULES, sanitizeOutput, takeStderrTail, virtualError, defaultMaxAttempts } from '@vidbee/task-queue/classifier'
export type { ClassifyInput }
export function classify(input: ClassifyInput) { return classifyKernel(input, Date.now()) }
export function parseRetryAfter(header: string | null | undefined) { return parseRetryAfterKernel(header, Date.now()) }

export function getRuleForCategory(category: import("../types.js").ErrorCategory) {
 try { return getRuleKernel(category) } catch { throw new Error(`no rule for category ${category}`) }
}
