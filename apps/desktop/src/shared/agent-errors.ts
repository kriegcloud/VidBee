import * as HS from 'effect/HashSet'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as R from 'effect/Record'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import {
  AgentErrorCode,
  type AgentFailure,
  AgentErrorCode as ReexportAgentErrorCode,
  AgentFailure as ReexportAgentFailure
} from './AgentFailure.model'
import { isRecoverableAiPromptError } from './ai-run'

export { ReexportAgentErrorCode as AgentErrorCode, ReexportAgentFailure as AgentFailure }

const RETRYABLE_CODES = HS.fromIterable<AgentErrorCode>([
  'TRANSPORT_LOST',
  'PROVIDER_UNAVAILABLE',
  'CONTEXT_OVERFLOW',
  'OUTPUT_TRUNCATED',
  'STREAM_INTERRUPTED',
  'RESUME_FAILED'
])

/** Versioned Cloud failure classes; keep in sync with Cloud `describeProviderFailure` reasons. */
const CLOUD_REASON_CODES: Record<string, AgentErrorCode> = {
  'provider-content-filter': 'CONTENT_FILTERED',
  truncated: 'OUTPUT_TRUNCATED',
  incomplete: 'STREAM_INTERRUPTED',
  'stream-interrupted': 'STREAM_INTERRUPTED',
  'provider-connection': 'TRANSPORT_LOST',
  'provider-http': 'TRANSPORT_LOST',
  'timeout-or-cancel': 'TRANSPORT_LOST',
  'provider-rate-limit': 'PROVIDER_UNAVAILABLE',
  'credit-budget-exhausted': 'BILLING_REJECTED',
  // Upstream context limits are terminal for this request; only our own HTTP-level
  // overflow protocol (sdkOverflowResponse) may trigger compaction retries.
  'provider-context-limit': 'PROVIDER_REJECTED',
  'response-too-large': 'PROVIDER_REJECTED',
  'provider-auth': 'PROVIDER_REJECTED',
  'provider-invalid-request': 'PROVIDER_REJECTED',
  'provider-invalid-role': 'PROVIDER_REJECTED',
  'provider-model-unavailable': 'PROVIDER_REJECTED',
  'provider-unsupported-parameter': 'PROVIDER_REJECTED',
  'empty-output': 'PROVIDER_REJECTED',
  persistence: 'PROVIDER_REJECTED'
}

/**
 * Classify a Cloud error envelope by its versioned reason token, never message prose.
 *
 * The envelope's explicit retryable flag is authoritative; the code's default applies
 * only when Cloud omitted it. Unknown future reasons still classify by that flag.
 *
 * @param envelope Structured error fields from a Cloud stream failure frame.
 * @returns Structured failure, or undefined when the envelope carries no reason contract.
 *
 * **Example** (Access the agentFailureFromCloudReason contract)
 *
 * ```ts
 * import { agentFailureFromCloudReason } from './agent-errors.js'
 * void agentFailureFromCloudReason
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function agentFailureFromCloudReason(envelope: {
  reason?: string | null
  retryable?: boolean | null
  message?: string | null
}): AgentFailure | undefined {
  const reason =
    envelope.reason === undefined || envelope.reason === null
      ? undefined
      : Str.trim(envelope.reason)
  if ((reason === undefined || reason.length === 0) && !P.isBoolean(envelope.retryable)) {
    return undefined
  }
  const mapped =
    reason !== undefined && reason.length > 0 && R.has(CLOUD_REASON_CODES, reason)
      ? CLOUD_REASON_CODES[reason]
      : undefined
  const retryable = P.isBoolean(envelope.retryable)
    ? envelope.retryable
    : mapped === undefined
      ? false
      : isRetryableAgentError(mapped)
  const code = mapped ?? (retryable ? 'STREAM_INTERRUPTED' : 'PROVIDER_REJECTED')
  return {
    code,
    message:
      (envelope.message === undefined || envelope.message === null
        ? undefined
        : Str.trim(envelope.message)) || `Cloud request failed (${reason ?? 'unknown reason'})`,
    retryable
  }
}
const MARKER = /^\[VB:([A-Z_]+)\]\s*(.*)$/s
const CONNECTION_PREFIX = /^(?:connection error:\s*)+/i
const LEGACY_INCOMPLETE =
  /terminated|connection stopped|before the response finished|output limit|Cloud response could not be resumed/i

/**
 * Encode a failure into transportable text: "[VB:CODE] message".
 *
 * @param failure Structured failure to serialize.
 *
 * **Example** (Access the encodeAgentError contract)
 *
 * ```ts
 * import { encodeAgentError } from './agent-errors.js'
 * void encodeAgentError
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function encodeAgentError(failure: AgentFailure): string {
  const message = Str.trim(failure.message)
  return P.isTruthy(message) ? `[VB:${failure.code}] ${message}` : `[VB:${failure.code}]`
}

/**
 * True when this code is eligible for SDK connection retries.
 *
 * @param code Machine-readable failure code.
 *
 * **Example** (Access the isRetryableAgentError contract)
 *
 * ```ts
 * import { isRetryableAgentError } from './agent-errors.js'
 * void isRetryableAgentError
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function isRetryableAgentError(code: AgentErrorCode): boolean {
  return HS.has(RETRYABLE_CODES, code)
}

/**
 * Parse "[VB:CODE] ..." markers; the only legacy fallback regex lives here.
 *
 * @param text Encoded or historical error text.
 *
 * **Example** (Access the parseAgentError contract)
 *
 * ```ts
 * import { parseAgentError } from './agent-errors.js'
 * void parseAgentError
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function parseAgentError(text: string | undefined): AgentFailure {
  const raw = (text === undefined || text === null ? undefined : Str.trim(text)) ?? ''
  if (raw.length === 0) {
    return {
      code: 'INTERNAL',
      message: '',
      retryable: false
    }
  }
  const unmarked = Str.trim(Str.replace(CONNECTION_PREFIX, '')(raw))
  const marked = O.getOrNull(Str.match(MARKER)(unmarked))
  if (marked !== null && S.is(AgentErrorCode)(marked[1])) {
    const code = marked[1]
    return {
      code,
      message:
        (marked[2] === undefined || marked[2] === null ? undefined : Str.trim(marked[2])) || raw,
      retryable: isRetryableAgentError(code)
    }
  }
  return classifyLegacyError(raw)
}

/**
 * Rewrite a retryable failure into the SDK's `Connection error` vocabulary.
 *
 * The Pi SDK retries only messages containing `Connection error`. This is the
 * only translator that speaks that vocabulary.
 *
 * @param failure Structured failure from parseAgentError or a classifier.
 *
 * **Example** (Access the toSdkRetryMessage contract)
 *
 * ```ts
 * import { toSdkRetryMessage } from './agent-errors.js'
 * void toSdkRetryMessage
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function toSdkRetryMessage(failure: AgentFailure): string | undefined {
  const text = Str.trim(failure.message)
  if (!(failure.retryable && text.length > 0)) {
    return undefined
  }
  if (CONNECTION_PREFIX.test(text)) {
    return undefined
  }
  return `Connection error: ${encodeAgentError(failure)}`
}

/**
 * Error subclass whose message is intended for the user verbatim.
 */

/**
 * Classify unmarked historical or Cloud prose using the former recovery regex.
 *
 * @param text User-facing or transport error text.
 */
function classifyLegacyError(text: string): AgentFailure {
  const retryable = isRecoverableAiPromptError(text)
  if (
    /context[_\s.-]?length|input too large|AI_AGENT_INPUT_TOO_LARGE|AI_AGENT_CONTEXT_EXCEEDED/i.test(
      text
    )
  ) {
    return {
      code: 'CONTEXT_OVERFLOW',
      message: text,
      retryable: true
    }
  }
  if (/output limit|stopReason length|truncated/i.test(text)) {
    return {
      code: 'OUTPUT_TRUNCATED',
      message: text,
      retryable: true
    }
  }
  if (/could not be resumed|AI_AGENT_RESUME/i.test(text)) {
    return {
      code: 'RESUME_FAILED',
      message: text,
      retryable: true
    }
  }
  if (/content.?filter/i.test(text)) {
    return {
      code: 'CONTENT_FILTERED',
      message: text,
      retryable: false
    }
  }
  if (/credits|quota|\b402\b|entitlement|BILLING/i.test(text) && !retryable) {
    return {
      code: 'BILLING_REJECTED',
      message: text,
      retryable: false
    }
  }
  if (/\bcancel(?:led)?\b|\baborted\b/i.test(text) && !retryable) {
    return {
      code: 'CANCELLED',
      message: text,
      retryable: false
    }
  }
  if (/stalled|repeating the same action/i.test(text)) {
    return {
      code: 'STALLED',
      message: text,
      retryable: false
    }
  }
  if (/persist the agent conversation|PERSISTENCE/i.test(text)) {
    return {
      code: 'PERSISTENCE_FAILED',
      message: text,
      retryable: false
    }
  }
  if (/\btimeout\b|no progress for/i.test(text) && !retryable) {
    return {
      code: 'TIMEOUT',
      message: text,
      retryable: false
    }
  }
  if (
    LEGACY_INCOMPLETE.test(text) ||
    /connection (?:stopped|reset|closed)|terminated/i.test(text)
  ) {
    return {
      code: 'STREAM_INTERRUPTED',
      message: text,
      retryable: true
    }
  }
  if (retryable) {
    return {
      code: /\b(?:429|503|overload|rate.?limit)/i.test(text)
        ? 'PROVIDER_UNAVAILABLE'
        : 'TRANSPORT_LOST',
      message: text,
      retryable: true
    }
  }
  return {
    code: 'INTERNAL',
    message: text,
    retryable: false
  }
}
