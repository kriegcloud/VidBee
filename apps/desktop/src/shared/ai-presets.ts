import * as A from 'effect/Array'
import * as HM from 'effect/HashMap'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as Str from 'effect/String'
import type { AiProviderPreset, AiProviderPresetId } from './ai-types'
import { recordFunction } from './RecordFunction.js'

/**
 * Built-in OpenAI-compatible providers. Preset base URLs stay in the catalog so
 * the settings dialog can hide the field unless the user picks Custom.
 * @example AI_PROVIDER_PRESETS
 * @category utilities
 * @since 0.0.0
 */
export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: 'cliproxy',
    defaultModel: 'gpt-6.1-sol',
    needsApiKey: false,
    requiresBaseUrl: false,
    baseUrl: 'http://127.0.0.1:8317/v1'
  },
  {
    id: 'custom',
    defaultModel: '',
    needsApiKey: true,
    requiresBaseUrl: true
  },
  {
    id: 'alibaba',
    defaultModel: 'qwen-plus',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    website: 'dashscope.console.aliyun.com'
  },
  {
    id: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.anthropic.com',
    website: 'anthropic.com'
  },
  {
    id: 'azure',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.openai.com/v1',
    website: 'azure.microsoft.com'
  },
  {
    id: 'deepseek',
    defaultModel: 'deepseek-chat',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.deepseek.com',
    website: 'platform.deepseek.com'
  },
  {
    id: 'fireworks',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    website: 'fireworks.ai'
  },
  {
    id: 'google',
    defaultModel: 'gemini-2.5-flash',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://generativelanguage.googleapis.com',
    website: 'aistudio.google.com'
  },
  {
    id: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.groq.com/openai/v1',
    website: 'console.groq.com'
  },
  {
    id: 'huggingface',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://router.huggingface.co/v1',
    website: 'huggingface.co'
  },
  {
    id: 'lmstudio',
    defaultModel: '',
    needsApiKey: false,
    requiresBaseUrl: false,
    baseUrl: 'http://127.0.0.1:1234/v1',
    website: 'lmstudio.ai'
  },
  {
    id: 'minimax',
    defaultModel: 'MiniMax-M1',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.minimax.chat/v1',
    website: 'platform.minimax.io'
  },
  {
    id: 'mistral',
    defaultModel: 'mistral-small-latest',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.mistral.ai/v1',
    website: 'console.mistral.ai'
  },
  {
    id: 'moonshot',
    defaultModel: 'kimi-k2.5',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.moonshot.cn/v1',
    website: 'platform.moonshot.cn'
  },
  {
    id: 'novita',
    defaultModel: 'deepseek/deepseek-v3-0324',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.novita.ai/v3/openai',
    website: 'novita.ai'
  },
  {
    id: 'ollama',
    defaultModel: 'llama3.1',
    needsApiKey: false,
    requiresBaseUrl: false,
    baseUrl: 'http://127.0.0.1:11434/v1',
    website: 'ollama.com'
  },
  {
    id: 'openai',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.openai.com/v1',
    website: 'platform.openai.com'
  },
  {
    id: 'openrouter',
    defaultModel: 'openai/gpt-4o-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://openrouter.ai/api/v1',
    website: 'openrouter.ai'
  },
  {
    id: 'ppio',
    defaultModel: 'deepseek/deepseek-v3-turbo',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.ppio.com/openai',
    website: 'ppio.com'
  },
  {
    id: 'siliconflow',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.siliconflow.cn/v1',
    website: 'siliconflow.cn'
  },
  {
    id: 'stepfun',
    defaultModel: 'step-2-mini',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.stepfun.com/v1',
    website: 'platform.stepfun.com'
  },
  {
    id: 'together',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.together.xyz/v1',
    website: 'together.ai'
  },
  {
    id: 'volcengine',
    defaultModel: 'doubao-1.5-pro-32k',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    website: 'console.volcengine.com'
  },
  {
    id: 'xai',
    defaultModel: 'grok-4.5',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://api.x.ai/v1',
    website: 'x.ai'
  },
  {
    id: 'zhipu',
    defaultModel: 'glm-4.5-flash',
    needsApiKey: true,
    requiresBaseUrl: false,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    website: 'open.bigmodel.cn'
  }
] as const
const PRESET_BY_ID = HM.fromIterable(
  A.map(AI_PROVIDER_PRESETS, (preset): [string, AiProviderPreset] => [preset.id, preset])
)

/**
 * Look up a built-in provider by id.
 *
 * @param id Preset id from settings or storage.
 * @returns The catalog entry, or undefined when the id is unknown.
 * @example getAiProviderPreset
 * @category utilities
 * @since 0.0.0
 */
export const getAiProviderPreset = (id: string): AiProviderPreset | undefined =>
  O.getOrUndefined(HM.get(PRESET_BY_ID, id))

/**
 * Resolve the base URL a provider should use.
 *
 * Custom (and any preset that requires it) uses the user value. Other presets
 * always use the catalog URL so the dialog can omit the field.
 *
 * @param presetId Built-in provider id.
 * @param userBaseUrl Optional URL typed in the dialog.
 */
function resolveAiProviderBaseUrlBody(presetId: AiProviderPresetId, userBaseUrl?: string): string {
  const preset = getAiProviderPreset(presetId)
  if (P.isTruthy(preset?.requiresBaseUrl)) {
    return (
      (userBaseUrl === undefined || userBaseUrl === null ? undefined : Str.trim(userBaseUrl)) ?? ''
    )
  }
  return (
    preset?.baseUrl ??
    (userBaseUrl === undefined || userBaseUrl === null ? undefined : Str.trim(userBaseUrl)) ??
    ''
  )
}

/**
 * True when the dialog should ask for a base URL.
 *
 * @param presetId Built-in provider id.
 * @example aiProviderRequiresBaseUrl
 * @category utilities
 * @since 0.0.0
 */
export const aiProviderRequiresBaseUrl = (presetId: AiProviderPresetId): boolean =>
  getAiProviderPreset(presetId)?.requiresBaseUrl === true

/**
 * True when the provider needs an API key to run.
 *
 * @param presetId Built-in provider id.
 * @example aiProviderNeedsApiKey
 * @category utilities
 * @since 0.0.0
 */
export const aiProviderNeedsApiKey = (presetId: AiProviderPresetId): boolean =>
  getAiProviderPreset(presetId)?.needsApiKey !== false

/** Anthropic model ids and family names that the proxy can expose. */
const CLIPROXY_BLOCKED_MODEL = /claude|anthropic|\b(?:opus|sonnet|haiku|fable)\b/iu

/**
 * Claude models are not allowed through CLIProxyAPI: routing a Claude
 * subscription credential through the proxy breaks Anthropic's terms
 * (effective 2026-11-12). Use the Anthropic preset with an API key instead.
 *
 * @param presetId Built-in provider id.
 * @param modelId Requested model id.
 */
function isAiProviderModelBlockedBody(presetId: AiProviderPresetId, modelId: string): boolean {
  return presetId === 'cliproxy' && CLIPROXY_BLOCKED_MODEL.test(modelId)
}
/** CLIPROXY_BLOCKED_MODEL_ERROR shared contract.
 * @category utilities
 * @since 0.0.0
 * @example CLIPROXY_BLOCKED_MODEL_ERROR
 */
export const CLIPROXY_BLOCKED_MODEL_ERROR =
  'Claude models are not available through CLIProxyAPI. Use the Anthropic provider with an API key.'

/** Record contract for resolveAiProviderBaseUrl.
 * @category ports
 * @since 0.0.0
 * @example ResolveAiProviderBaseUrlInput
 */
export interface ResolveAiProviderBaseUrlInput {
  presetId: AiProviderPresetId
  userBaseUrl?: string | undefined
}
/** resolveAiProviderBaseUrl with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example resolveAiProviderBaseUrl
 */
export const resolveAiProviderBaseUrl: {
  (): (input: ResolveAiProviderBaseUrlInput) => string
  (input: ResolveAiProviderBaseUrlInput): string
} = recordFunction((input: ResolveAiProviderBaseUrlInput): string =>
  resolveAiProviderBaseUrlBody(input.presetId, input.userBaseUrl)
)
/** Record contract for isAiProviderModelBlocked.
 * @category ports
 * @since 0.0.0
 * @example IsAiProviderModelBlockedInput
 */
export interface IsAiProviderModelBlockedInput {
  presetId: AiProviderPresetId
  modelId: string
}
/** isAiProviderModelBlocked with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example isAiProviderModelBlocked
 */
export const isAiProviderModelBlocked: {
  (): (input: IsAiProviderModelBlockedInput) => boolean
  (input: IsAiProviderModelBlockedInput): boolean
} = recordFunction((input: IsAiProviderModelBlockedInput): boolean =>
  isAiProviderModelBlockedBody(input.presetId, input.modelId)
)
