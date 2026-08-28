import type { AiProviderPreset, AiProviderPresetId } from './ai-types'

/**
 * Built-in OpenAI-compatible providers. Preset base URLs stay in the catalog so
 * the settings dialog can hide the field unless the user picks Custom.
 */
export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: 'custom',
    defaultModel: '',
    needsApiKey: true,
    requiresBaseUrl: true
  },
  {
    id: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.anthropic.com'
  },
  {
    id: 'azure',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.openai.com/v1'
  },
  {
    id: 'deepseek',
    defaultModel: 'deepseek-chat',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.deepseek.com'
  },
  {
    id: 'google',
    defaultModel: 'gemini-2.5-flash',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://generativelanguage.googleapis.com'
  },
  {
    id: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.groq.com/openai/v1'
  },
  {
    id: 'huggingface',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://router.huggingface.co/v1'
  },
  {
    id: 'lmstudio',
    defaultModel: '',
    needsApiKey: false,
    requiresBaseUrl: false,
    baseUrl: 'http://127.0.0.1:1234/v1'
  },
  {
    id: 'ollama',
    defaultModel: 'llama3.1',
    needsApiKey: false,
    requiresBaseUrl: false,
    baseUrl: 'http://127.0.0.1:11434/v1'
  },
  {
    id: 'openai',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.openai.com/v1'
  },
  {
    id: 'openrouter',
    defaultModel: 'openai/gpt-4o-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://openrouter.ai/api/v1'
  },
  {
    id: 'xai',
    defaultModel: 'grok-4.5',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.x.ai/v1'
  }
] as const

const PRESET_BY_ID = new Map(AI_PROVIDER_PRESETS.map((preset) => [preset.id, preset]))

/**
 * Look up a built-in provider by id.
 *
 * @param id Preset id from settings or storage.
 * @returns The catalog entry, or undefined when the id is unknown.
 */
export const getAiProviderPreset = (id: string): AiProviderPreset | undefined =>
  PRESET_BY_ID.get(id as AiProviderPresetId)

/**
 * Resolve the base URL a provider should use.
 *
 * Custom (and any preset that requires it) uses the user value. Other presets
 * always use the catalog URL so the dialog can omit the field.
 *
 * @param presetId Built-in provider id.
 * @param userBaseUrl Optional URL typed in the dialog.
 */
export const resolveAiProviderBaseUrl = (
  presetId: AiProviderPresetId,
  userBaseUrl?: string
): string => {
  const preset = getAiProviderPreset(presetId)
  if (preset?.requiresBaseUrl) {
    return userBaseUrl?.trim() ?? ''
  }
  return preset?.baseUrl ?? userBaseUrl?.trim() ?? ''
}

/**
 * True when the dialog should ask for a base URL.
 *
 * @param presetId Built-in provider id.
 */
export const aiProviderRequiresBaseUrl = (presetId: AiProviderPresetId): boolean =>
  getAiProviderPreset(presetId)?.requiresBaseUrl === true

/**
 * True when the provider needs an API key to run.
 *
 * @param presetId Built-in provider id.
 */
export const aiProviderNeedsApiKey = (presetId: AiProviderPresetId): boolean =>
  getAiProviderPreset(presetId)?.needsApiKey !== false
