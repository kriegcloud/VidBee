import { type Api, getModel, type Model } from '@earendil-works/pi-ai/compat'
import { getAiProviderPreset, resolveAiProviderBaseUrl } from '../../shared/ai-presets'
import type { AiProviderPresetId } from '../../shared/ai-types'

type PiKnownProvider =
  | 'anthropic'
  | 'azure-openai-responses'
  | 'deepseek'
  | 'google'
  | 'groq'
  | 'huggingface'
  | 'openai'
  | 'openrouter'
  | 'xai'

const PI_PROVIDER_BY_PRESET: Partial<Record<AiProviderPresetId, PiKnownProvider>> = {
  anthropic: 'anthropic',
  azure: 'azure-openai-responses',
  deepseek: 'deepseek',
  google: 'google',
  groq: 'groq',
  huggingface: 'huggingface',
  openai: 'openai',
  openrouter: 'openrouter',
  xai: 'xai'
}

const OPENAI_COMPLETIONS_PRESETS = new Set<AiProviderPresetId>([
  'custom',
  'huggingface',
  'lmstudio',
  'ollama',
  'openrouter',
  'groq',
  'deepseek',
  'xai',
  'openai'
])

/**
 * Build a fallback OpenAI-compatible model when the catalog has no match.
 *
 * @param modelId User-entered model id.
 * @param baseUrl Provider endpoint.
 */
const createOpenAiCompatibleModel = (
  modelId: string,
  baseUrl: string
): Model<'openai-completions'> =>
  ({
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'unknown',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192
  }) as Model<'openai-completions'>

/**
 * Resolve a pi-ai model for a configured provider.
 *
 * Known presets try the catalog first so Anthropic/Google keep their native
 * APIs. Anything else, including custom endpoints, uses OpenAI completions.
 *
 * @param input Provider preset, model id, and optional custom base URL.
 */
export const resolvePiModel = (input: {
  presetId: AiProviderPresetId
  modelId: string
  baseUrl?: string
}): Model<Api> => {
  const modelId = input.modelId.trim()
  const baseUrl = resolveAiProviderBaseUrl(input.presetId, input.baseUrl)
  const piProvider = PI_PROVIDER_BY_PRESET[input.presetId]
  if (piProvider && modelId) {
    try {
      const catalogModel = getModel(piProvider as never, modelId as never) as Model<Api>
      if (baseUrl && OPENAI_COMPLETIONS_PRESETS.has(input.presetId)) {
        return { ...catalogModel, baseUrl }
      }
      return catalogModel
    } catch {
      // The user can type any model id; fall through to a compatible model.
    }
  }

  if (input.presetId === 'anthropic') {
    return {
      id: modelId,
      name: modelId,
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: getAiProviderPreset('anthropic')?.baseUrl ?? 'https://api.anthropic.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 8192
    }
  }

  if (input.presetId === 'google') {
    return {
      id: modelId,
      name: modelId,
      api: 'google-generative-ai',
      provider: 'google',
      baseUrl:
        getAiProviderPreset('google')?.baseUrl ?? 'https://generativelanguage.googleapis.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1_000_000,
      maxTokens: 8192
    }
  }

  return createOpenAiCompatibleModel(modelId, baseUrl)
}
