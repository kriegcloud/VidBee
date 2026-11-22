import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as A from 'effect/Array'
import * as HS from 'effect/HashSet'
import * as P from 'effect/Predicate'
import * as Str from 'effect/String'
import * as Sparse from './ArrayHelpers.js'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/ai-run')

import type { AiPromptErrorCode, AiPromptRunSnapshot, AiPromptRunStatus } from './ai-types'

const TERMINAL_PROMPT_RUN_STATUSES = HS.fromIterable<AiPromptRunStatus>([
  'completed',
  'aborted',
  'error'
])
const AUTH_PATTERN = /401|403|unauthor|forbidden|api key|apikey|invalid key|authentication/i
const NETWORK_PATTERN =
  /enotfound|econnrefused|econnreset|etimedout|timed out|network|fetch failed|failed to fetch|dns|certificate|ssl|eai_again|connection error|connection refused|econn|socket hang up|und_err|ehostunreach|enetunreach|epipe|connect timeout|could not reach vidbee cloud/i
const TERSE_CONNECTION_ERROR = /^connection error\.?$/i
const CONNECTION_ERROR_DETAIL =
  'Could not connect to the AI provider. Check your internet, proxy, and the provider Base URL.'
const CLOUD_CONNECTION_DETAIL =
  'Could not reach VidBee Cloud. Check your internet connection, then try again.'
const INCOMPLETE_STREAM_PATTERN = /stream ended without finish_reason/i

/**
 * Empty snapshot used before the first run of a prompt.
 *
 * @param downloadId Download id.
 * @param promptId Prompt id.
 * @param now Timestamp.
 */
function idlePromptRunSnapshotBody(
  downloadId: string,
  promptId: string,
  now: number
): AiPromptRunSnapshot {
  return {
    downloadId,
    promptId,
    status: 'idle',
    text: '',
    thinking: '',
    thinkingMs: 0,
    error: null,
    errorCode: null,
    updatedAt: now
  }
}

/**
 * Reserved internal ids are not real downloads and must not be stored.
 *
 * @param downloadId Download id.
 * @example isEphemeralPromptRunDownloadId
 * @category utilities
 * @since 0.0.0
 */
export const isEphemeralPromptRunDownloadId = (downloadId: string): boolean =>
  Str.startsWith('__')(downloadId)

/**
 * True when a snapshot is a finished result that should survive a restart.
 *
 * @param status Run lifecycle.
 * @example isTerminalPromptRunStatus
 * @category utilities
 * @since 0.0.0
 */
export const isTerminalPromptRunStatus = (status: AiPromptRunStatus): boolean =>
  HS.has(TERMINAL_PROMPT_RUN_STATUSES, status)

/** Visual mark shown on a transcript prompt tab. Idle and aborted stay unmarked. */
/** Prompt tab marks; structural for legacy construction.
 * **Example** (Reject invalid PromptTabIndicator input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PromptTabIndicator } from './ai-run.js'
 * strictEqual(S.is(PromptTabIndicator)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PromptTabIndicator = LiteralKit(['running', 'completed', 'error']).pipe(
  $I.annoteSchema('PromptTabIndicator', {
    description: 'PromptTabIndicator shared boundary data.'
  })
)
/** PromptTabIndicator shared contract.
 * @category utilities
 * @since 0.0.0
 * @example PromptTabIndicator
 */
export type PromptTabIndicator = typeof PromptTabIndicator.Type

/**
 * Map a prompt-run lifecycle onto the tab indicator, or null when nothing should show.
 * Completed and error marks hide after the user opens that tab.
 *
 * @param status Latest run status for that prompt.
 * @param viewed True when the current completed/error result has already been opened.
 */
function promptTabIndicatorBody(
  status: AiPromptRunStatus,
  viewed = false
): PromptTabIndicator | null {
  if (status === 'running') {
    return 'running'
  }
  if (status === 'completed' || status === 'error') {
    return viewed ? null : status
  }
  return null
}

/**
 * Walk `error.cause` so a terse SDK message still includes the syscall.
 *
 * @param error Thrown value from the provider client.
 * @example flattenErrorMessage
 * @category utilities
 * @since 0.0.0
 */
export const flattenErrorMessage = (error: unknown): string => {
  const parts: string[] = []
  const seen: unknown[] = []
  let current: unknown = error
  while (
    P.isTruthy(current) &&
    !A.some(seen, (value) => Object.is(value, current) || value === current) &&
    parts.length < 5
  ) {
    seen.push(current)
    if (P.isString(current)) {
      const text = Str.trim(current)
      if (text.length > 0) {
        parts.push(text)
      }
      break
    }
    if (current instanceof Error) {
      const text = Str.trim(current.message)
      if (text.length > 0) {
        parts.push(text)
      }
      current = current.cause
      continue
    }
    if (P.isObjectOrArray(current) && 'message' in current) {
      const text = Str.trim(String(current.message ?? ''))
      if (text.length > 0) {
        parts.push(text)
      }
      current = 'cause' in current ? current.cause : undefined
      continue
    }
    break
  }
  let unique = HS.empty<string>()
  const ordered: string[] = []
  for (const part of parts) {
    if (!HS.has(unique, part)) {
      unique = HS.add(unique, part)
      ordered.push(part)
    }
  }
  return A.join(ordered, '\n')
}

/**
 * Expand a terse connection failure so the details box is readable.
 *
 * @param message Flattened provider or runner error.
 * @param viaCloud True when this run used VidBee Cloud instead of a local key.
 */
function formatAiPromptErrorBody(message: string, viaCloud = false): string {
  const trimmed = Str.trim(message)
  const lines = Sparse.filter({
    items: Sparse.map({
      items: Str.split('\n')(trimmed),
      map: (line) => Str.trim(line)
    }),
    predicate: (line) => line.length > 0
  })
  const extra = Sparse.filter({
    items: lines,
    predicate: (line) => !TERSE_CONNECTION_ERROR.test(line)
  })
  const hadTerseConnection = extra.length !== lines.length
  if (!hadTerseConnection) {
    return trimmed
  }
  const head = viaCloud ? CLOUD_CONNECTION_DETAIL : CONNECTION_ERROR_DETAIL
  const rest = A.join(extra, '\n')
  if (rest.length === 0) {
    return head
  }
  if (viaCloud && /could not reach vidbee cloud/i.test(rest)) {
    return rest
  }
  return `${head}\n${rest}`
}

/**
 * True when the model wrote tokens but the SSE stream omitted finish_reason.
 *
 * @param message Flattened provider or runner error.
 * @example isIncompleteAiStreamError
 * @category utilities
 * @since 0.0.0
 */
export const isIncompleteAiStreamError = (message: string): boolean =>
  INCOMPLETE_STREAM_PATTERN.test(message)

/** Five recovery attempts after the initial request, with increasing backoff.  * @example AI_PROMPT_RECOVERY_DELAYS_MS
 * @category utilities
 * @since 0.0.0
 */
export const AI_PROMPT_RECOVERY_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000] as const

/**
 * Failure classes VidBee Cloud reports as retryable on its structured `reason` field.
 * Mirrors `PROVIDER_FAILURE_RETRYABLE` in the Cloud worker; both sides are covered by
 * a shared contract test. Local providers have no `reason`, so they fall back to prose.
 */
const CLOUD_RETRYABLE_REASONS = HS.make(
  ...[
    'incomplete',
    'provider-connection',
    'provider-http',
    'provider-rate-limit',
    'stream-interrupted',
    'timeout-or-cancel',
    'truncated'
  ]
)

/**
 * Decide recovery from a Cloud failure reason when present, else from message prose.
 *
 * Prefer this over the prose-only classifier wherever a Cloud error envelope is in hand:
 * the reason token is a versioned contract, the message is human-facing copy that may be
 * reworded at any time.
 *
 * @param failure Error envelope from the Cloud stream, or a bare provider message.
 * @example isRecoverableAiFailure
 * @category utilities
 * @since 0.0.0
 */
export const isRecoverableAiFailure = (failure: {
  reason?: string | null
  retryable?: boolean | null
  message?: string | null
}): boolean => {
  if (P.isBoolean(failure.retryable)) {
    return failure.retryable
  }
  if (P.isTruthy(failure.reason)) {
    return HS.has(CLOUD_RETRYABLE_REASONS, failure.reason ?? '')
  }
  return isRecoverableAiPromptError(failure.message ?? '')
}

/** Retry transient upstream failures and truncated output without retrying permanent rejections.  * @example isRecoverableAiPromptError
 * @category utilities
 * @since 0.0.0
 */
export const isRecoverableAiPromptError = (message: string): boolean => {
  if (
    /\b(?:400|401|402|403|404|422)\b|authentication|unauthori[sz]ed|forbidden|api.key|credits|quota|context.length|context.limit|content.filter|certificate|invalid (?:request|model|parameter)/i.test(
      message
    )
  ) {
    return false
  }
  return (
    isIncompleteAiStreamError(message) ||
    /\b(?:408|425|429|500|502|503|504|520|521|522|523|524|529)\b|rate.?limit|overload|temporarily unavailable|service unavailable|bad gateway|timed out|timeout|connection (?:stopped before|error|reset|closed)|could not (?:reach|connect)|econnreset|econnrefused|eai_again|etimedout|epipe|socket|fetch failed|failed to fetch|network|terminated|before the response finished|reached its output limit/i.test(
      message
    )
  )
}

/**
 * Map a provider/model failure to a guidance code.
 *
 * @param message Error text from pi-agent or the local runner.
 * @param emptyText True when the model finished without writing anything.
 */
function classifyAiPromptErrorBody(
  message: string | null | undefined,
  emptyText = false
): AiPromptErrorCode {
  const text = (message === undefined || message === null ? undefined : Str.trim(message)) ?? ''
  if (/no ai provider/i.test(text)) {
    return 'no-provider'
  }
  if (/missing an api key/i.test(text)) {
    return 'missing-api-key'
  }
  if (/missing a model id/i.test(text)) {
    return 'missing-model'
  }
  if (/unknown prompt/i.test(text)) {
    return 'unknown-prompt'
  }
  if (/transcript is empty/i.test(text)) {
    return 'empty-transcript'
  }
  if (/AI_CREDIT_QUOTA_EXCEEDED|not enough ai credits|\b402\b/i.test(text)) {
    return 'credits-exhausted'
  }
  if (/sign in required/i.test(text) || Str.includes('UNAUTHORIZED')(text)) {
    return 'sign-in-required'
  }
  if (AUTH_PATTERN.test(text)) {
    return 'auth'
  }
  if (
    /AI_REQUEST_ALREADY_EXISTS|AI_AGENT_CALL_FAILED|This operation is already running or has failed/i.test(
      text
    ) ||
    NETWORK_PATTERN.test(text) ||
    isRecoverableAiPromptError(text)
  ) {
    return 'network'
  }
  if (text.length > 0) {
    return 'unknown'
  }
  return emptyText ? 'empty-output' : 'unknown'
}

/**
 * True when the user should be sent to provider settings to fix this failure.
 *
 * @param code Classified error.
 * @example aiPromptErrorNeedsProviderSettings
 * @category utilities
 * @since 0.0.0
 */
export const aiPromptErrorNeedsProviderSettings = (code: AiPromptErrorCode | null): boolean =>
  code === 'sign-in-required' ||
  code === 'credits-exhausted' ||
  code === 'no-provider' ||
  code === 'missing-api-key' ||
  code === 'missing-model' ||
  code === 'auth' ||
  code === 'network' ||
  code === 'empty-output' ||
  code === 'unknown'

/** Record contract for idlePromptRunSnapshot.
 * @category ports
 * @since 0.0.0
 * @example IdlePromptRunSnapshotInput
 */
export interface IdlePromptRunSnapshotInput {
  downloadId: string
  promptId: string
  now: number
}
/** idlePromptRunSnapshot with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example idlePromptRunSnapshot
 */
export const idlePromptRunSnapshot: {
  (): (input: IdlePromptRunSnapshotInput) => AiPromptRunSnapshot
  (input: IdlePromptRunSnapshotInput): AiPromptRunSnapshot
} = recordFunction(
  (input: IdlePromptRunSnapshotInput): AiPromptRunSnapshot =>
    idlePromptRunSnapshotBody(input.downloadId, input.promptId, input.now)
)
/** Record contract for promptTabIndicator.
 * @category ports
 * @since 0.0.0
 * @example PromptTabIndicatorInput
 */
export interface PromptTabIndicatorInput {
  status: AiPromptRunStatus
  viewed?: boolean | undefined
}
/** promptTabIndicator with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example promptTabIndicator
 */
export const promptTabIndicator: {
  (): (input: PromptTabIndicatorInput) => PromptTabIndicator | null
  (input: PromptTabIndicatorInput): PromptTabIndicator | null
} = recordFunction((input: PromptTabIndicatorInput): PromptTabIndicator | null =>
  promptTabIndicatorBody(input.status, input.viewed)
)
/** Record contract for formatAiPromptError.
 * @category ports
 * @since 0.0.0
 * @example FormatAiPromptErrorInput
 */
export interface FormatAiPromptErrorInput {
  message: string
  viaCloud?: boolean | undefined
}
/** formatAiPromptError with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example formatAiPromptError
 */
export const formatAiPromptError: {
  (): (input: FormatAiPromptErrorInput) => string
  (input: FormatAiPromptErrorInput): string
} = recordFunction((input: FormatAiPromptErrorInput): string =>
  formatAiPromptErrorBody(input.message, input.viaCloud)
)
/** Record contract for classifyAiPromptError.
 * @category ports
 * @since 0.0.0
 * @example ClassifyAiPromptErrorInput
 */
export interface ClassifyAiPromptErrorInput {
  message: string | null | undefined
  emptyText?: boolean | undefined
}
/** classifyAiPromptError with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example classifyAiPromptError
 */
export const classifyAiPromptError: {
  (): (input: ClassifyAiPromptErrorInput) => AiPromptErrorCode
  (input: ClassifyAiPromptErrorInput): AiPromptErrorCode
} = recordFunction(
  (input: ClassifyAiPromptErrorInput): AiPromptErrorCode =>
    classifyAiPromptErrorBody(input.message, input.emptyText)
)
