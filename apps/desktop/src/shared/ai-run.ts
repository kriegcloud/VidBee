import type { AiPromptErrorCode, AiPromptRunSnapshot, AiPromptRunStatus } from './ai-types'

const TERMINAL_PROMPT_RUN_STATUSES = new Set<AiPromptRunStatus>(['completed', 'aborted', 'error'])

const AUTH_PATTERN = /401|403|unauthor|forbidden|api key|apikey|invalid key|authentication/i
const NETWORK_PATTERN =
  /enotfound|econnrefused|econnreset|etimedout|timed out|network|fetch failed|dns|certificate|ssl|eai_again/i

/**
 * Empty snapshot used before the first run of a prompt.
 *
 * @param downloadId Download or settings-test id.
 * @param promptId Prompt id.
 * @param now Timestamp.
 */
export const idlePromptRunSnapshot = (
  downloadId: string,
  promptId: string,
  now: number = Date.now()
): AiPromptRunSnapshot => ({
  downloadId,
  promptId,
  status: 'idle',
  text: '',
  thinking: '',
  thinkingMs: 0,
  error: null,
  errorCode: null,
  updatedAt: now
})

/**
 * Settings "test prompt" ids are not real downloads and must not be stored.
 *
 * @param downloadId Download or settings-test id.
 */
export const isEphemeralPromptRunDownloadId = (downloadId: string): boolean =>
  downloadId.startsWith('__')

/**
 * True when a snapshot is a finished result that should survive a restart.
 *
 * @param status Run lifecycle.
 */
export const isTerminalPromptRunStatus = (status: AiPromptRunStatus): boolean =>
  TERMINAL_PROMPT_RUN_STATUSES.has(status)

/**
 * Map a provider/model failure to a guidance code.
 *
 * @param message Error text from pi-agent or the local runner.
 * @param emptyText True when the model finished without writing anything.
 */
export const classifyAiPromptError = (
  message: string | null | undefined,
  emptyText = false
): AiPromptErrorCode => {
  const text = message?.trim() ?? ''
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
  if (AUTH_PATTERN.test(text)) {
    return 'auth'
  }
  if (NETWORK_PATTERN.test(text)) {
    return 'network'
  }
  if (text) {
    return 'unknown'
  }
  return emptyText ? 'empty-output' : 'unknown'
}

/**
 * True when the user should be sent to provider settings to fix this failure.
 *
 * @param code Classified error.
 */
export const aiPromptErrorNeedsProviderSettings = (code: AiPromptErrorCode | null): boolean =>
  code === 'no-provider' ||
  code === 'missing-api-key' ||
  code === 'missing-model' ||
  code === 'auth' ||
  code === 'network' ||
  code === 'empty-output' ||
  code === 'unknown'
