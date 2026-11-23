import * as O from 'effect/Option'
import * as Native from '../../shared/ai-run'
import {
  AI_PROMPT_RECOVERY_DELAYS_MS as ReexportAI_PROMPT_RECOVERY_DELAYS_MS,
  aiPromptErrorNeedsProviderSettings as ReexportaiPromptErrorNeedsProviderSettings,
  type ClassifyAiPromptErrorInput as ReexportClassifyAiPromptErrorInput,
  type FormatAiPromptErrorInput as ReexportFormatAiPromptErrorInput,
  flattenErrorMessage as ReexportflattenErrorMessage,
  type IdlePromptRunSnapshotInput as ReexportIdlePromptRunSnapshotInput,
  isEphemeralPromptRunDownloadId as ReexportisEphemeralPromptRunDownloadId,
  isIncompleteAiStreamError as ReexportisIncompleteAiStreamError,
  isRecoverableAiFailure as ReexportisRecoverableAiFailure,
  isRecoverableAiPromptError as ReexportisRecoverableAiPromptError,
  isTerminalPromptRunStatus as ReexportisTerminalPromptRunStatus,
  type PromptTabIndicator as ReexportPromptTabIndicator,
  type PromptTabIndicatorInput as ReexportPromptTabIndicatorInput
} from '../../shared/ai-run'

export {
  ReexportAI_PROMPT_RECOVERY_DELAYS_MS as AI_PROMPT_RECOVERY_DELAYS_MS,
  ReexportaiPromptErrorNeedsProviderSettings as aiPromptErrorNeedsProviderSettings,
  type ReexportClassifyAiPromptErrorInput as ClassifyAiPromptErrorInput,
  type ReexportFormatAiPromptErrorInput as FormatAiPromptErrorInput,
  ReexportflattenErrorMessage as flattenErrorMessage,
  type ReexportIdlePromptRunSnapshotInput as IdlePromptRunSnapshotInput,
  ReexportisEphemeralPromptRunDownloadId as isEphemeralPromptRunDownloadId,
  ReexportisIncompleteAiStreamError as isIncompleteAiStreamError,
  ReexportisRecoverableAiFailure as isRecoverableAiFailure,
  ReexportisRecoverableAiPromptError as isRecoverableAiPromptError,
  ReexportisTerminalPromptRunStatus as isTerminalPromptRunStatus,
  type ReexportPromptTabIndicator as PromptTabIndicator,
  type ReexportPromptTabIndicatorInput as PromptTabIndicatorInput
}

import type { PromptTabIndicator } from '../../shared/ai-run'
import type {
  AiPromptErrorCode,
  AiPromptRunSnapshot,
  AiPromptRunStatus
} from '../../shared/ai-types'
export function idlePromptRunSnapshot(
  downloadId: string,
  promptId: string,
  now: number = Date.now()
): AiPromptRunSnapshot {
  return Native.idlePromptRunSnapshot({
    downloadId,
    promptId,
    now
  })
}
export function promptTabIndicator(
  status: AiPromptRunStatus,
  viewed = false
): PromptTabIndicator | null {
  return O.getOrNull(
    Native.promptTabIndicator({
      status,
      viewed
    })
  )
}
export function formatAiPromptError(message: string, viaCloud = false): string {
  return Native.formatAiPromptError({
    message,
    viaCloud
  })
}
export function classifyAiPromptError(
  message: string | null | undefined,
  emptyText = false
): AiPromptErrorCode {
  return Native.classifyAiPromptError({
    message,
    emptyText
  })
}
