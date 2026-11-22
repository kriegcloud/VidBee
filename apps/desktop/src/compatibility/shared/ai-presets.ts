import * as Native from '../../shared/ai-presets'
import {
  AI_PROVIDER_PRESETS as ReexportAI_PROVIDER_PRESETS,
  aiProviderNeedsApiKey as ReexportaiProviderNeedsApiKey,
  aiProviderRequiresBaseUrl as ReexportaiProviderRequiresBaseUrl,
  CLIPROXY_BLOCKED_MODEL_ERROR as ReexportCLIPROXY_BLOCKED_MODEL_ERROR,
  getAiProviderPreset as ReexportgetAiProviderPreset,
  type IsAiProviderModelBlockedInput as ReexportIsAiProviderModelBlockedInput,
  type ResolveAiProviderBaseUrlInput as ReexportResolveAiProviderBaseUrlInput
} from '../../shared/ai-presets'

export {
  ReexportAI_PROVIDER_PRESETS as AI_PROVIDER_PRESETS,
  ReexportaiProviderNeedsApiKey as aiProviderNeedsApiKey,
  ReexportaiProviderRequiresBaseUrl as aiProviderRequiresBaseUrl,
  ReexportCLIPROXY_BLOCKED_MODEL_ERROR as CLIPROXY_BLOCKED_MODEL_ERROR,
  ReexportgetAiProviderPreset as getAiProviderPreset,
  type ReexportIsAiProviderModelBlockedInput as IsAiProviderModelBlockedInput,
  type ReexportResolveAiProviderBaseUrlInput as ResolveAiProviderBaseUrlInput
}

import type { AiProviderPresetId } from '../../shared/ai-types'
export function resolveAiProviderBaseUrl(
  presetId: AiProviderPresetId,
  userBaseUrl?: string
): string {
  return Native.resolveAiProviderBaseUrl({
    presetId,
    userBaseUrl
  })
}
export function isAiProviderModelBlocked(presetId: AiProviderPresetId, modelId: string): boolean {
  return Native.isAiProviderModelBlocked({
    presetId,
    modelId
  })
}
