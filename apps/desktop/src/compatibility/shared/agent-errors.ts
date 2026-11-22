import * as Native from '../../shared/agent-errors'
import {
  AgentErrorCode as ReexportAgentErrorCode,
  AgentFailure as ReexportAgentFailure,
  encodeAgentError as ReexportencodeAgentError,
  isRetryableAgentError as ReexportisRetryableAgentError,
  parseAgentError as ReexportparseAgentError,
  toSdkRetryMessage as ReexporttoSdkRetryMessage
} from '../../shared/agent-errors'

export {
  ReexportAgentErrorCode as AgentErrorCode,
  ReexportAgentFailure as AgentFailure,
  ReexportencodeAgentError as encodeAgentError,
  ReexportisRetryableAgentError as isRetryableAgentError,
  ReexportparseAgentError as parseAgentError,
  ReexporttoSdkRetryMessage as toSdkRetryMessage
}

import type { AgentErrorCode, AgentFailure } from '../../shared/agent-errors'
export class AgentUserError extends Error {
  readonly code: AgentErrorCode
  readonly retryable: boolean
  constructor(message: string, code: AgentErrorCode = 'INTERNAL', retryable = false) {
    super(message)
    this.name = 'AgentUserError'
    this.code = code
    this.retryable = retryable
  }

  /** Convert this error into the shared failure shape. */
  toFailure(): AgentFailure {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable
    }
  }
}

// The historical Record lookup also sees Object.prototype. Preserve that peculiar
// in-process contract only here; strict failures always carry a declared error code.
const inheritedReasonCodes: Record<string, AgentErrorCode> = {}
/** Preserve historical prototype-named Cloud reasons without decoding legacy calls. */
export function agentFailureFromCloudReason(envelope: {
  reason?: string | null
  retryable?: boolean | null
  message?: string | null
}): AgentFailure | undefined {
  const reason = envelope.reason?.trim()
  const inherited = reason ? inheritedReasonCodes[reason] : undefined
  if (inherited) {
    return {
      code: inherited,
      message: envelope.message?.trim() || `Cloud request failed (${reason ?? 'unknown reason'})`,
      retryable:
        typeof envelope.retryable === 'boolean'
          ? envelope.retryable
          : Native.isRetryableAgentError(inherited)
    }
  }
  return Native.agentFailureFromCloudReason(envelope)
}
