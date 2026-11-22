import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'

const JsonValue = S.Json
const JsonObject = S.JsonObject
const Api = S.String
const ProviderId = S.String
const ModelThinkingLevel = LiteralKit(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const StopReason = LiteralKit([
  'pending',
  'stop',
  'length',
  'toolUse',
  'error',
  'aborted',
  'deferred'
])
const GrammarVariants = S.Struct({
  openai_lark: S.optional(S.String),
  openai_regex: S.optional(S.String)
})
const TParameters = S.declare((u): u is NonNullable<unknown> => P.isNotNullish(u))
const $I = $DesktopId.create('shared/RawMessage.model')

/** TextContent shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TextContent input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TextContent } from './RawMessage.model.js'
 * strictEqual(S.is(TextContent)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TextContent = S.Struct({
  type: S.Literal('text').pipe(S.mutableKey),
  text: S.String.pipe(S.mutableKey),
  textSignature: S.String.pipe(S.optional, S.mutableKey)
}).pipe($I.annoteSchema('TextContent', { description: 'TextContent shared boundary data.' }))
/** Decoded mutable TextContent data.
 * @category type-level
 * @since 0.0.0
 * @example TextContent
 */
export type TextContent = typeof TextContent.Type

/** ThinkingContent shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ThinkingContent input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ThinkingContent } from './RawMessage.model.js'
 * strictEqual(S.is(ThinkingContent)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ThinkingContent = S.Struct({
  type: S.Literal('thinking').pipe(S.mutableKey),
  thinking: S.String.pipe(S.mutableKey),
  thinkingSignature: S.String.pipe(S.optional, S.mutableKey),
  redacted: S.Boolean.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('ThinkingContent', { description: 'ThinkingContent shared boundary data.' })
)
/** Decoded mutable ThinkingContent data.
 * @category type-level
 * @since 0.0.0
 * @example ThinkingContent
 */
export type ThinkingContent = typeof ThinkingContent.Type

/** ImageContent shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ImageContent input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ImageContent } from './RawMessage.model.js'
 * strictEqual(S.is(ImageContent)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ImageContent = S.Struct({
  type: S.Literal('image').pipe(S.mutableKey),
  data: S.String.pipe(S.mutableKey),
  mimeType: S.String.pipe(S.mutableKey)
}).pipe($I.annoteSchema('ImageContent', { description: 'ImageContent shared boundary data.' }))
/** Decoded mutable ImageContent data.
 * @category type-level
 * @since 0.0.0
 * @example ImageContent
 */
export type ImageContent = typeof ImageContent.Type

/** ToolCall shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ToolCall input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ToolCall } from './RawMessage.model.js'
 * strictEqual(S.is(ToolCall)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ToolCall = S.Struct({
  type: S.Literal('toolCall').pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  arguments: JsonObject.pipe(S.mutableKey),
  thoughtSignature: S.String.pipe(S.optional, S.mutableKey),
  namespace: S.String.pipe(S.optional, S.mutableKey),
  argumentsError: S.String.pipe(S.optional, S.mutableKey)
}).pipe($I.annoteSchema('ToolCall', { description: 'ToolCall shared boundary data.' }))
/** Decoded mutable ToolCall data.
 * @category type-level
 * @since 0.0.0
 * @example ToolCall
 */
export type ToolCall = typeof ToolCall.Type

/** Usage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid Usage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { Usage } from './RawMessage.model.js'
 * strictEqual(S.is(Usage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Usage = S.Struct({
  input: S.Finite.pipe(S.mutableKey),
  output: S.Finite.pipe(S.mutableKey),
  cacheRead: S.Finite.pipe(S.mutableKey),
  cacheWrite: S.Finite.pipe(S.mutableKey),
  cacheWrite1h: S.Finite.pipe(S.optional, S.mutableKey),
  reasoning: S.Finite.pipe(S.optional, S.mutableKey),
  totalTokens: S.Finite.pipe(S.mutableKey),
  cost: S.Struct({
    input: S.Finite.pipe(S.mutableKey),
    output: S.Finite.pipe(S.mutableKey),
    cacheRead: S.Finite.pipe(S.mutableKey),
    cacheWrite: S.Finite.pipe(S.mutableKey),
    total: S.Finite.pipe(S.mutableKey)
  }).pipe(S.mutableKey)
}).pipe($I.annoteSchema('Usage', { description: 'Usage shared boundary data.' }))
/** Decoded mutable Usage data.
 * @category type-level
 * @since 0.0.0
 * @example Usage
 */
export type Usage = typeof Usage.Type

/** DeferredHandle shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DeferredHandle input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DeferredHandle } from './RawMessage.model.js'
 * strictEqual(S.is(DeferredHandle)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DeferredHandle = S.Struct({
  provider: S.String.pipe(S.mutableKey),
  modelId: S.String.pipe(S.mutableKey),
  api: S.String.pipe(S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  expiresAt: S.Finite.pipe(S.optional, S.mutableKey),
  pollAfterMs: S.Finite.pipe(S.optional, S.mutableKey),
  data: JsonValue.pipe(S.optional, S.mutableKey)
}).pipe($I.annoteSchema('DeferredHandle', { description: 'DeferredHandle shared boundary data.' }))
/** Decoded mutable DeferredHandle data.
 * @category type-level
 * @since 0.0.0
 * @example DeferredHandle
 */
export type DeferredHandle = typeof DeferredHandle.Type

/** UserMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid UserMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { UserMessage } from './RawMessage.model.js'
 * strictEqual(S.is(UserMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const UserMessage = S.Struct({
  role: S.Literal('user').pipe(S.mutableKey),
  content: S.Union([S.String, S.Array(S.Union([TextContent, ImageContent])).pipe(S.mutable)]).pipe(
    S.mutableKey
  ),
  timestamp: S.Finite.pipe(S.mutableKey)
}).pipe($I.annoteSchema('UserMessage', { description: 'UserMessage shared boundary data.' }))
/** Decoded mutable UserMessage data.
 * @category type-level
 * @since 0.0.0
 * @example UserMessage
 */
export type UserMessage = typeof UserMessage.Type

/** NestedToolCallRecord shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid NestedToolCallRecord input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { NestedToolCallRecord } from './RawMessage.model.js'
 * strictEqual(S.is(NestedToolCallRecord)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const NestedToolCallRecord = S.Struct({
  id: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  arguments: JsonObject.pipe(S.optional, S.mutableKey),
  argumentsBytes: S.Finite.pipe(S.optional, S.mutableKey),
  status: LiteralKit(['ok', 'error', 'unfinished']).pipe(S.mutableKey),
  durationMs: S.Finite.pipe(S.optional, S.mutableKey),
  error: S.String.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('NestedToolCallRecord', {
    description: 'NestedToolCallRecord shared boundary data.'
  })
)
/** Decoded mutable NestedToolCallRecord data.
 * @category type-level
 * @since 0.0.0
 * @example NestedToolCallRecord
 */
export type NestedToolCallRecord = typeof NestedToolCallRecord.Type

/** NestedToolCalls shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid NestedToolCalls input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { NestedToolCalls } from './RawMessage.model.js'
 * strictEqual(S.is(NestedToolCalls)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const NestedToolCalls = S.Struct({
  calls: S.Array(NestedToolCallRecord).pipe(S.mutable, S.mutableKey),
  complete: S.Boolean.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('NestedToolCalls', { description: 'NestedToolCalls shared boundary data.' })
)
/** Decoded mutable NestedToolCalls data.
 * @category type-level
 * @since 0.0.0
 * @example NestedToolCalls
 */
export type NestedToolCalls = typeof NestedToolCalls.Type

/** ToolResultMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ToolResultMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ToolResultMessage } from './RawMessage.model.js'
 * strictEqual(S.is(ToolResultMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ToolResultMessage = S.Struct({
  role: S.Literal('toolResult').pipe(S.mutableKey),
  toolCallId: S.String.pipe(S.mutableKey),
  toolName: S.String.pipe(S.mutableKey),
  content: S.Array(S.Union([TextContent, ImageContent])).pipe(S.mutable, S.mutableKey),
  details: JsonValue.pipe(S.optional, S.mutableKey),
  usage: Usage.pipe(S.optional, S.mutableKey),
  nestedCalls: NestedToolCalls.pipe(S.optional, S.mutableKey),
  isError: S.Boolean.pipe(S.mutableKey),
  timestamp: S.Finite.pipe(S.mutableKey),
  durationMs: S.Finite.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('ToolResultMessage', { description: 'ToolResultMessage shared boundary data.' })
)
/** Decoded mutable ToolResultMessage data.
 * @category type-level
 * @since 0.0.0
 * @example ToolResultMessage
 */
export type ToolResultMessage = typeof ToolResultMessage.Type

/** ConstrainedSamplingConfig shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ConstrainedSamplingConfig input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ConstrainedSamplingConfig } from './RawMessage.model.js'
 * strictEqual(S.is(ConstrainedSamplingConfig)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ConstrainedSamplingConfig = S.Union([
  S.Struct({
    type: S.Literal('json_schema').pipe(S.mutableKey),
    strict: LiteralKit(['prefer', 'require']).pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('grammar').pipe(S.mutableKey),
    variants: GrammarVariants.pipe(S.mutableKey)
  })
]).pipe(
  $I.annoteSchema('ConstrainedSamplingConfig', {
    description: 'ConstrainedSamplingConfig shared boundary data.'
  })
)
/** Decoded mutable ConstrainedSamplingConfig data.
 * @category type-level
 * @since 0.0.0
 * @example ConstrainedSamplingConfig
 */
export type ConstrainedSamplingConfig = typeof ConstrainedSamplingConfig.Type

/** Tool shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid Tool input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { Tool } from './RawMessage.model.js'
 * strictEqual(S.is(Tool)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Tool = S.Struct({
  name: S.String.pipe(S.mutableKey),
  description: S.String.pipe(S.mutableKey),
  parameters: TParameters.pipe(S.mutableKey),
  constrainedSampling: S.Union([S.Literal(false), ConstrainedSamplingConfig]).pipe(
    S.optional,
    S.mutableKey
  )
}).pipe($I.annoteSchema('Tool', { description: 'Tool shared boundary data.' }))
/** Decoded mutable Tool data.
 * @category type-level
 * @since 0.0.0
 * @example Tool
 */
export type Tool = typeof Tool.Type

/** ToolReference shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ToolReference input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ToolReference } from './RawMessage.model.js'
 * strictEqual(S.is(ToolReference)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ToolReference = S.Struct({
  name: S.String.pipe(S.mutableKey)
}).pipe($I.annoteSchema('ToolReference', { description: 'ToolReference shared boundary data.' }))
/** Decoded mutable ToolReference data.
 * @category type-level
 * @since 0.0.0
 * @example ToolReference
 */
export type ToolReference = typeof ToolReference.Type

/** DiagnosticErrorInfo shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DiagnosticErrorInfo input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DiagnosticErrorInfo } from './RawMessage.model.js'
 * strictEqual(S.is(DiagnosticErrorInfo)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DiagnosticErrorInfo = S.Struct({
  name: S.String.pipe(S.optional, S.mutableKey),
  message: S.String.pipe(S.mutableKey),
  stack: S.String.pipe(S.optional, S.mutableKey),
  code: S.Union([S.String, S.Finite]).pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('DiagnosticErrorInfo', {
    description: 'DiagnosticErrorInfo shared boundary data.'
  })
)
/** Decoded mutable DiagnosticErrorInfo data.
 * @category type-level
 * @since 0.0.0
 * @example DiagnosticErrorInfo
 */
export type DiagnosticErrorInfo = typeof DiagnosticErrorInfo.Type

/** AssistantMessageDiagnostic shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AssistantMessageDiagnostic input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AssistantMessageDiagnostic } from './RawMessage.model.js'
 * strictEqual(S.is(AssistantMessageDiagnostic)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AssistantMessageDiagnostic = S.Struct({
  type: S.String.pipe(S.mutableKey),
  timestamp: S.Finite.pipe(S.mutableKey),
  error: DiagnosticErrorInfo.pipe(S.optional, S.mutableKey),
  details: JsonObject.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AssistantMessageDiagnostic', {
    description: 'AssistantMessageDiagnostic shared boundary data.'
  })
)
/** Decoded mutable AssistantMessageDiagnostic data.
 * @category type-level
 * @since 0.0.0
 * @example AssistantMessageDiagnostic
 */
export type AssistantMessageDiagnostic = typeof AssistantMessageDiagnostic.Type

/** SdkCustomMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SdkCustomMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SdkCustomMessage } from './RawMessage.model.js'
 * strictEqual(S.is(SdkCustomMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SdkCustomMessage = S.Struct({
  role: S.Literal('custom').pipe(S.mutableKey),
  customType: S.String.pipe(S.mutableKey),
  content: UserMessage.fields.content.pipe(S.mutableKey),
  display: S.Boolean.pipe(S.mutableKey),
  details: S.Unknown.pipe(S.optional, S.mutableKey),
  timestamp: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('SdkCustomMessage', { description: 'SdkCustomMessage shared boundary data.' })
)
/** Decoded mutable SdkCustomMessage data.
 * @category type-level
 * @since 0.0.0
 * @example SdkCustomMessage
 */
export type SdkCustomMessage = typeof SdkCustomMessage.Type

/** SystemMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SystemMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SystemMessage } from './RawMessage.model.js'
 * strictEqual(S.is(SystemMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SystemMessage = S.Struct({
  role: S.Literal('system').pipe(S.mutableKey),
  content: S.Union([S.String, S.Array(TextContent).pipe(S.mutable)]).pipe(S.mutableKey),
  sections: S.Record(S.String, S.Union([S.String, S.Null]).pipe(S.mutableKey)).pipe(
    S.optional,
    S.mutableKey
  ),
  toolsAdded: S.Array(Tool).pipe(S.mutable, S.optional, S.mutableKey),
  toolsRemoved: S.Array(ToolReference).pipe(S.mutable, S.optional, S.mutableKey),
  timestamp: S.Finite.pipe(S.mutableKey)
}).pipe($I.annoteSchema('SystemMessage', { description: 'SystemMessage shared boundary data.' }))
/** Decoded mutable SystemMessage data.
 * @category type-level
 * @since 0.0.0
 * @example SystemMessage
 */
export type SystemMessage = typeof SystemMessage.Type

/** AssistantMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AssistantMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AssistantMessage } from './RawMessage.model.js'
 * strictEqual(S.is(AssistantMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AssistantMessage = S.Struct({
  role: S.Literal('assistant').pipe(S.mutableKey),
  content: S.Array(S.Union([TextContent, ThinkingContent, ToolCall])).pipe(S.mutable, S.mutableKey),
  api: Api.pipe(S.mutableKey),
  provider: ProviderId.pipe(S.mutableKey),
  model: S.String.pipe(S.mutableKey),
  responseModel: S.String.pipe(S.optional, S.mutableKey),
  responseId: S.String.pipe(S.optional, S.mutableKey),
  providerThinkingLevel: S.String.pipe(S.optional, S.mutableKey),
  thinkingLevel: ModelThinkingLevel.pipe(S.optional, S.mutableKey),
  diagnostics: S.Array(AssistantMessageDiagnostic).pipe(S.mutable, S.optional, S.mutableKey),
  usage: Usage.pipe(S.mutableKey),
  stopReason: StopReason.pipe(S.mutableKey),
  deferred: DeferredHandle.pipe(S.optional, S.mutableKey),
  errorMessage: S.String.pipe(S.optional, S.mutableKey),
  rawStopReason: S.String.pipe(S.optional, S.mutableKey),
  endTurn: S.Boolean.pipe(S.optional, S.mutableKey),
  timestamp: S.Finite.pipe(S.mutableKey),
  durationMs: S.Finite.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('AssistantMessage', { description: 'AssistantMessage shared boundary data.' })
)
/** Decoded mutable AssistantMessage data.
 * @category type-level
 * @since 0.0.0
 * @example AssistantMessage
 */
export type AssistantMessage = typeof AssistantMessage.Type

/** Message shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid Message input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { Message } from './RawMessage.model.js'
 * strictEqual(S.is(Message)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Message = S.Union([
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage
]).pipe($I.annoteSchema('Message', { description: 'Message shared boundary data.' }))
/** Decoded mutable Message data.
 * @category type-level
 * @since 0.0.0
 * @example Message
 */
export type Message =
  typeof Message.Type /** Installed SDK/app message union; structural for legacy construction.
 * **Example** (Reject invalid AgentMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentMessage } from './RawMessage.model.js'
 * strictEqual(S.is(AgentMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentMessage = S.Union([Message, SdkCustomMessage]).pipe(
  $I.annoteSchema('AgentMessage', {
    description: 'Installed pi messages and the application custom message.'
  })
)
/** AgentMessage shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AgentMessage
 */
export type AgentMessage = typeof AgentMessage.Type
