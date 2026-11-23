import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'
import { AgentThinkingLevel, ProviderDefaultThinkingLevel } from './agent-chat.js'

const $I = $DesktopId.create('shared/ai-types')

/** Built-in LLM provider ids shown on the settings catalog. */

/** Catalog entry for a built-in provider. */

/** Persisted provider configuration. The API key never leaves the main process. */

/** Payload used to create or update a provider from the renderer. */

/** User-editable prompt used with a transcript. */

/** Payload used to create or update a managed skill. */

/** Lifecycle of a prompt run that lives in the main process. */

/** Why a prompt run failed, used to pick setup guidance in the UI. */

/** Result of a one-shot ping that checks whether a provider can run. */

/** Snapshot a renderer can restore after navigating away. */

/** Input required to start a prompt run. */

/** Providers and prompts returned together for settings pages. */

/** AiProviderPresetId shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiProviderPresetId input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiProviderPresetId } from './ai-types.js'
 * strictEqual(S.is(AiProviderPresetId)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiProviderPresetId = LiteralKit([
  'alibaba',
  'anthropic',
  'azure',
  'cliproxy',
  'custom',
  'deepseek',
  'fireworks',
  'google',
  'groq',
  'huggingface',
  'lmstudio',
  'minimax',
  'mistral',
  'moonshot',
  'novita',
  'ollama',
  'openai',
  'openrouter',
  'ppio',
  'siliconflow',
  'stepfun',
  'together',
  'volcengine',
  'xai',
  'zhipu'
]).pipe(
  $I.annoteSchema('AiProviderPresetId', { description: 'AiProviderPresetId shared boundary data.' })
)
/** Decoded mutable AiProviderPresetId data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiProviderPresetId contract)
 *
 * ```ts
 * import { AiProviderPresetId } from './ai-types.js'
 * void AiProviderPresetId
 * ```
 *
 */
export type AiProviderPresetId = typeof AiProviderPresetId.Type

/** AiProviderPreset shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiProviderPreset input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiProviderPreset } from './ai-types.js'
 * strictEqual(S.is(AiProviderPreset)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiProviderPreset = S.Struct({
  id: AiProviderPresetId.pipe(S.mutableKey),
  defaultModel: S.String.pipe(S.mutableKey),
  needsApiKey: S.Boolean.pipe(S.mutableKey),
  requiresBaseUrl: S.Boolean.pipe(S.mutableKey),
  baseUrl: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  website: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('AiProviderPreset', { description: 'AiProviderPreset shared boundary data.' })
)
/** Decoded mutable AiProviderPreset data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiProviderPreset contract)
 *
 * ```ts
 * import { AiProviderPreset } from './ai-types.js'
 * void AiProviderPreset
 * ```
 *
 */
export type AiProviderPreset = typeof AiProviderPreset.Type

/** AiProviderConfig shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiProviderConfig input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiProviderConfig } from './ai-types.js'
 * strictEqual(S.is(AiProviderConfig)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiProviderConfig = S.Struct({
  groupId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  contextWindow: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  vision: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tools: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  reasoning: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thinkingOnly: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  allowDisableThinking: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thinkingLevels: S.Array(AgentThinkingLevel).pipe(
    S.mutable,
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  defaultThinkingLevel: ProviderDefaultThinkingLevel.pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  maxTokens: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  presetId: AiProviderPresetId.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  baseUrl: S.String.pipe(S.mutableKey),
  modelId: S.String.pipe(S.mutableKey),
  hasApiKey: S.Boolean.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AiProviderConfig', { description: 'AiProviderConfig shared boundary data.' })
)
/** Decoded mutable AiProviderConfig data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiProviderConfig contract)
 *
 * ```ts
 * import { AiProviderConfig } from './ai-types.js'
 * void AiProviderConfig
 * ```
 *
 */
export type AiProviderConfig = typeof AiProviderConfig.Type

/** AiProviderWriteInput shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiProviderWriteInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiProviderWriteInput } from './ai-types.js'
 * strictEqual(S.is(AiProviderWriteInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiProviderWriteInput = S.Struct({
  groupId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  contextWindow: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  vision: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tools: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  reasoning: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thinkingOnly: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  allowDisableThinking: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thinkingLevels: S.Array(AgentThinkingLevel).pipe(
    S.mutable,
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  defaultThinkingLevel: ProviderDefaultThinkingLevel.pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  maxTokens: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  id: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  presetId: AiProviderPresetId.pipe(S.mutableKey),
  name: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  baseUrl: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  modelId: S.String.pipe(S.mutableKey),
  apiKey: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  copyApiKeyFromId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('AiProviderWriteInput', {
    description: 'AiProviderWriteInput shared boundary data.'
  })
)
/** Decoded mutable AiProviderWriteInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiProviderWriteInput contract)
 *
 * ```ts
 * import { AiProviderWriteInput } from './ai-types.js'
 * void AiProviderWriteInput
 * ```
 *
 */
export type AiProviderWriteInput = typeof AiProviderWriteInput.Type

/** AiPrompt shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiPrompt input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiPrompt } from './ai-types.js'
 * strictEqual(S.is(AiPrompt)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiPrompt = S.Struct({
  name: S.String.pipe(S.mutableKey),
  directoryName: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  workflowOnly: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  skillError: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  content: S.String.pipe(S.mutableKey),
  autoRun: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  showInTranscript: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  isPreset: S.Boolean.pipe(S.mutableKey),
  userCreated: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  sortOrder: S.Finite.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey)
}).pipe($I.annoteSchema('AiPrompt', { description: 'AiPrompt shared boundary data.' }))
/** Decoded mutable AiPrompt data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiPrompt contract)
 *
 * ```ts
 * import { AiPrompt } from './ai-types.js'
 * void AiPrompt
 * ```
 *
 */
export type AiPrompt = typeof AiPrompt.Type

/** AiPromptWriteInput shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiPromptWriteInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiPromptWriteInput } from './ai-types.js'
 * strictEqual(S.is(AiPromptWriteInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiPromptWriteInput = S.Struct({
  previousName: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  content: S.String.pipe(S.mutableKey),
  enabled: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  autoRun: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  showInTranscript: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  frontmatter: S.Record(S.String, S.Unknown.pipe(S.mutableKey)).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('AiPromptWriteInput', { description: 'AiPromptWriteInput shared boundary data.' })
)
/** Decoded mutable AiPromptWriteInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiPromptWriteInput contract)
 *
 * ```ts
 * import { AiPromptWriteInput } from './ai-types.js'
 * void AiPromptWriteInput
 * ```
 *
 */
export type AiPromptWriteInput = typeof AiPromptWriteInput.Type

/** AiPromptRunStatus shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiPromptRunStatus input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiPromptRunStatus } from './ai-types.js'
 * strictEqual(S.is(AiPromptRunStatus)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiPromptRunStatus = LiteralKit([
  'idle',
  'running',
  'completed',
  'aborted',
  'error'
]).pipe(
  $I.annoteSchema('AiPromptRunStatus', { description: 'AiPromptRunStatus shared boundary data.' })
)
/** Decoded mutable AiPromptRunStatus data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiPromptRunStatus contract)
 *
 * ```ts
 * import { AiPromptRunStatus } from './ai-types.js'
 * void AiPromptRunStatus
 * ```
 *
 */
export type AiPromptRunStatus = typeof AiPromptRunStatus.Type

/** AiPromptErrorCode shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiPromptErrorCode input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiPromptErrorCode } from './ai-types.js'
 * strictEqual(S.is(AiPromptErrorCode)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiPromptErrorCode = LiteralKit([
  'sign-in-required',
  'credits-exhausted',
  'no-provider',
  'missing-api-key',
  'missing-model',
  'unknown-prompt',
  'empty-transcript',
  'auth',
  'network',
  'empty-output',
  'unknown'
]).pipe(
  $I.annoteSchema('AiPromptErrorCode', { description: 'AiPromptErrorCode shared boundary data.' })
)
/** Decoded mutable AiPromptErrorCode data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiPromptErrorCode contract)
 *
 * ```ts
 * import { AiPromptErrorCode } from './ai-types.js'
 * void AiPromptErrorCode
 * ```
 *
 */
export type AiPromptErrorCode = typeof AiPromptErrorCode.Type

/** AiProviderTestResult shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiProviderTestResult input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiProviderTestResult } from './ai-types.js'
 * strictEqual(S.is(AiProviderTestResult)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiProviderTestResult = S.Struct({
  ok: S.Boolean.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey),
  error: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  errorCode: S.Union([AiPromptErrorCode, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AiProviderTestResult', {
    description: 'AiProviderTestResult shared boundary data.'
  })
)
/** Decoded mutable AiProviderTestResult data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiProviderTestResult contract)
 *
 * ```ts
 * import { AiProviderTestResult } from './ai-types.js'
 * void AiProviderTestResult
 * ```
 *
 */
export type AiProviderTestResult = typeof AiProviderTestResult.Type

/** AiPromptRunSnapshot shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiPromptRunSnapshot input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiPromptRunSnapshot } from './ai-types.js'
 * strictEqual(S.is(AiPromptRunSnapshot)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiPromptRunSnapshot = S.Struct({
  providerType: LiteralKit(['cloud', 'byok']).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  cloudResultId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  recovery: S.Struct({
    attempt: S.Finite.pipe(S.mutableKey),
    maxAttempts: S.Finite.pipe(S.mutableKey),
    error: S.String.pipe(S.mutableKey)
  }).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  status: AiPromptRunStatus.pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey),
  thinking: S.String.pipe(S.mutableKey),
  thinkingMs: S.Finite.pipe(S.mutableKey),
  error: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  errorCode: S.Union([AiPromptErrorCode, S.Null]).pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AiPromptRunSnapshot', {
    description: 'AiPromptRunSnapshot shared boundary data.'
  })
)
/** Decoded mutable AiPromptRunSnapshot data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiPromptRunSnapshot contract)
 *
 * ```ts
 * import { AiPromptRunSnapshot } from './ai-types.js'
 * void AiPromptRunSnapshot
 * ```
 *
 */
export type AiPromptRunSnapshot = typeof AiPromptRunSnapshot.Type

/** AiPromptRunInput shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiPromptRunInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiPromptRunInput } from './ai-types.js'
 * strictEqual(S.is(AiPromptRunInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiPromptRunInput = S.Struct({
  forceRegenerate: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloadId: S.String.pipe(S.mutableKey),
  promptId: S.String.pipe(S.mutableKey),
  transcriptText: S.String.pipe(S.mutableKey),
  uiLanguage: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  sourceUrl: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  transcriptLanguage: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  transcriptOrigin: LiteralKit(['ai', 'human']).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('AiPromptRunInput', { description: 'AiPromptRunInput shared boundary data.' })
)
/** Decoded mutable AiPromptRunInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiPromptRunInput contract)
 *
 * ```ts
 * import { AiPromptRunInput } from './ai-types.js'
 * void AiPromptRunInput
 * ```
 *
 */
export type AiPromptRunInput = typeof AiPromptRunInput.Type

/** CloudModelOption shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid CloudModelOption input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { CloudModelOption } from './ai-types.js'
 * strictEqual(S.is(CloudModelOption)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CloudModelOption = S.Struct({
  id: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  multiplier: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('CloudModelOption', { description: 'CloudModelOption shared boundary data.' })
)
/** Decoded mutable CloudModelOption data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the CloudModelOption contract)
 *
 * ```ts
 * import { CloudModelOption } from './ai-types.js'
 * void CloudModelOption
 * ```
 *
 */
export type CloudModelOption = typeof CloudModelOption.Type

/** AiSettingsSnapshot shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiSettingsSnapshot input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiSettingsSnapshot } from './ai-types.js'
 * strictEqual(S.is(AiSettingsSnapshot)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiSettingsSnapshot = S.Struct({
  cloudModelId: S.Union([S.String, S.Null]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  activeProviderId: S.Union([S.String, S.Null]).pipe(S.mutableKey),
  providers: S.Array(AiProviderConfig).pipe(S.mutable, S.mutableKey),
  prompts: S.Array(AiPrompt).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('AiSettingsSnapshot', { description: 'AiSettingsSnapshot shared boundary data.' })
)
/** Decoded mutable AiSettingsSnapshot data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiSettingsSnapshot contract)
 *
 * ```ts
 * import { AiSettingsSnapshot } from './ai-types.js'
 * void AiSettingsSnapshot
 * ```
 *
 */
export type AiSettingsSnapshot = typeof AiSettingsSnapshot.Type
