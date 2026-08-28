/** Built-in LLM provider ids shown on the settings catalog. */
export type AiProviderPresetId =
  | 'anthropic'
  | 'azure'
  | 'custom'
  | 'deepseek'
  | 'google'
  | 'groq'
  | 'huggingface'
  | 'lmstudio'
  | 'ollama'
  | 'openai'
  | 'openrouter'
  | 'xai'

/** Lucide icon names stored with a prompt. */
export type AiPromptIconId =
  | 'list'
  | 'spell-check'
  | 'rows-3'
  | 'highlighter'
  | 'circle-help'
  | 'smile'
  | 'message-circle-question'
  | 'chart-no-axes-column'
  | 'repeat-2'
  | 'git-branch'
  | 'languages'
  | 'sparkles'

/** Catalog entry for a built-in provider. */
export interface AiProviderPreset {
  id: AiProviderPresetId
  defaultModel: string
  needsApiKey: boolean
  requiresBaseUrl: boolean
  baseUrl?: string
}

/** Persisted provider configuration. The API key never leaves the main process. */
export interface AiProviderConfig {
  id: string
  presetId: AiProviderPresetId
  name: string
  baseUrl: string
  modelId: string
  hasApiKey: boolean
  createdAt: number
  updatedAt: number
}

/** Payload used to create or update a provider from the renderer. */
export interface AiProviderWriteInput {
  id?: string
  presetId: AiProviderPresetId
  name?: string
  baseUrl?: string
  modelId: string
  apiKey?: string
}

/** User-editable prompt used with a transcript. */
export interface AiPrompt {
  id: string
  title: string
  icon: AiPromptIconId
  content: string
  enabled: boolean
  isPreset: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** Payload used to create or update a prompt from the renderer. */
export interface AiPromptWriteInput {
  id?: string
  title: string
  icon: AiPromptIconId
  content: string
  enabled?: boolean
}

/** Lifecycle of a prompt run that lives in the main process. */
export type AiPromptRunStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error'

/** Why a prompt run failed, used to pick setup guidance in the UI. */
export type AiPromptErrorCode =
  | 'no-provider'
  | 'missing-api-key'
  | 'missing-model'
  | 'unknown-prompt'
  | 'empty-transcript'
  | 'auth'
  | 'network'
  | 'empty-output'
  | 'unknown'

/** Result of a one-shot ping that checks whether a provider can run. */
export interface AiProviderTestResult {
  ok: boolean
  text: string
  error: string | null
  errorCode: AiPromptErrorCode | null
}

/** Snapshot a renderer can restore after navigating away. */
export interface AiPromptRunSnapshot {
  downloadId: string
  promptId: string
  status: AiPromptRunStatus
  text: string
  /** Model reasoning, shown in ThinkingSteps instead of Streamdown. */
  thinking: string
  /** Milliseconds spent reasoning, so the header keeps its duration on reload. */
  thinkingMs: number
  error: string | null
  errorCode: AiPromptErrorCode | null
  updatedAt: number
}

/** Input required to start a prompt run. */
export interface AiPromptRunInput {
  downloadId: string
  promptId: string
  transcriptText: string
  /** UI language tag; built-in translate prompts resolve {{uiLanguage}} from this. */
  uiLanguage?: string
}

/** Providers and prompts returned together for settings pages. */
export interface AiSettingsSnapshot {
  activeProviderId: string | null
  providers: AiProviderConfig[]
  prompts: AiPrompt[]
}
