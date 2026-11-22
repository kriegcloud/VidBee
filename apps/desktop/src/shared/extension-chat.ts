import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'
import { AgentUiResponse } from './AgentUi.model.js'
import {
  AgentRunEvent,
  AgentRunStatus,
  AgentThinkingLevel,
  AgentThinkingOptions,
  AgentThread,
  AgentThreadSummary
} from './agent-chat.js'
import { AiPrompt } from './ai-types.js'

const $I = $DesktopId.create('shared/extension-chat')

/** Browser evidence imported once into Desktop's persistent transcript library. */

/** Short-lived, origin-bound access to Desktop conversations, never provider credentials. */

/** One authoritative directory for the skills and conversations shown by both clients. */

/** Mutations have caller-generated identities so retrying a lost reply cannot send twice. */

/** Every response refreshes the directory together with the selected conversation. */

/** Public source context for history navigation; never includes local media paths. */

/** Credential-free Composer options shared by native and browser clients. */

/** Replay starts with a snapshot, then uses Desktop's ordered entity patches. */

/** Only persisted assistant replies can be exported or receive feedback. */

/** Export bytes are delivered to the browser without opening Desktop dialogs. */

/** Paginated, path-free library candidates for the shared video mention picker. */

/** ExtensionChatSource shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatSource input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatSource } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatSource)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatSource = S.Struct({
  sourceUrl: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  duration: S.Finite.pipe(S.mutableKey),
  language: S.String.pipe(S.optional, S.mutableKey),
  auto: S.Boolean.pipe(S.mutableKey),
  segments: S.Array(
    S.Struct({
      start: S.Finite.pipe(S.mutableKey),
      end: S.Finite.pipe(S.mutableKey),
      text: S.String.pipe(S.mutableKey)
    })
  ).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatSource', {
    description: 'ExtensionChatSource shared boundary data.'
  })
)
/** Decoded mutable ExtensionChatSource data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatSource
 */
export type ExtensionChatSource = typeof ExtensionChatSource.Type

/** ExtensionChatSession shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatSession input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatSession } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatSession)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatSession = S.Struct({
  id: S.String.pipe(S.mutableKey),
  token: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatSession', {
    description: 'ExtensionChatSession shared boundary data.'
  })
)
/** Decoded mutable ExtensionChatSession data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatSession
 */
export type ExtensionChatSession = typeof ExtensionChatSession.Type

/** ExtensionChatCommand shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatCommand input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatCommand } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatCommand)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatCommand = S.Union([
  S.Struct({
    type: S.Literal('open').pipe(S.mutableKey),
    promptId: S.String.pipe(S.mutableKey),
    threadId: S.String.pipe(S.optional, S.mutableKey),
    followSource: S.Boolean.pipe(S.optional, S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('create').pipe(S.mutableKey),
    requestId: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('send').pipe(S.mutableKey),
    requestId: S.String.pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey),
    text: S.String.pipe(S.optional, S.mutableKey),
    retryMessageId: S.String.pipe(S.optional, S.mutableKey),
    thinkingLevel: AgentThinkingLevel.pipe(S.optional, S.mutableKey),
    imageIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
    uiResponse: AgentUiResponse.pipe(S.optional, S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('thinking').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey),
    level: AgentThinkingLevel.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('remove-image').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey),
    imageId: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('stop').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('branch').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey),
    messageId: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('rename').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('delete').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('approve').pipe(S.mutableKey),
    threadId: S.String.pipe(S.mutableKey),
    toolCallId: S.String.pipe(S.mutableKey),
    approved: S.Boolean.pipe(S.mutableKey),
    remember: S.Boolean.pipe(S.mutableKey)
  })
]).pipe(
  $I.annoteSchema('ExtensionChatCommand', {
    description: 'ExtensionChatCommand shared boundary data.'
  })
)
/** Decoded mutable ExtensionChatCommand data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatCommand
 */
export type ExtensionChatCommand = typeof ExtensionChatCommand.Type

/** ExtensionChatVideo shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatVideo input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatVideo } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatVideo)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatVideo = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  duration: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatVideo', { description: 'ExtensionChatVideo shared boundary data.' })
)
/** Decoded mutable ExtensionChatVideo data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatVideo
 */
export type ExtensionChatVideo = typeof ExtensionChatVideo.Type

/** AgentComposerOptions shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentComposerOptions input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentComposerOptions } from './extension-chat.js'
 * strictEqual(S.is(AgentComposerOptions)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentComposerOptions = S.Struct({
  models: S.Array(
    S.Struct({
      value: S.String.pipe(S.mutableKey),
      label: S.String.pipe(S.mutableKey),
      description: S.String.pipe(S.optional, S.mutableKey),
      presetId: S.String.pipe(S.optional, S.mutableKey),
      modelId: S.String.pipe(S.optional, S.mutableKey)
    })
  ).pipe(S.mutable, S.mutableKey),
  selected: S.String.pipe(S.mutableKey),
  thinking: AgentThinkingOptions.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentComposerOptions', {
    description: 'AgentComposerOptions shared boundary data.'
  })
)
/** Decoded mutable AgentComposerOptions data.
 * @category type-level
 * @since 0.0.0
 * @example AgentComposerOptions
 */
export type AgentComposerOptions = typeof AgentComposerOptions.Type

/** ExtensionChatExport shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatExport input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatExport } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatExport)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatExport = S.Struct({
  threadId: S.String.pipe(S.mutableKey),
  messageId: S.String.pipe(S.mutableKey),
  format: LiteralKit(['md', 'pdf', 'png']).pipe(S.mutableKey),
  split: S.Boolean.pipe(S.optional, S.mutableKey),
  imageCount: S.Finite.pipe(S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatExport', {
    description: 'ExtensionChatExport shared boundary data.'
  })
)
/** Decoded mutable ExtensionChatExport data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatExport
 */
export type ExtensionChatExport = typeof ExtensionChatExport.Type

/** ExtensionChatFile shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatFile input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatFile } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatFile)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatFile = S.Struct({
  name: S.String.pipe(S.mutableKey),
  dataUrl: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatFile', { description: 'ExtensionChatFile shared boundary data.' })
)
/** Decoded mutable ExtensionChatFile data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatFile
 */
export type ExtensionChatFile = typeof ExtensionChatFile.Type

/** ExtensionChatVideos shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatVideos input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatVideos } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatVideos)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatVideos = S.Struct({
  videos: S.Array(
    S.Struct({
      id: S.String.pipe(S.mutableKey),
      title: S.String.pipe(S.mutableKey)
    })
  ).pipe(S.mutable, S.mutableKey),
  nextCursor: S.Union([S.String, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatVideos', {
    description: 'ExtensionChatVideos shared boundary data.'
  })
)
/** Decoded mutable ExtensionChatVideos data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatVideos
 */
export type ExtensionChatVideos = typeof ExtensionChatVideos.Type

/** ExtensionChatCatalog shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatCatalog input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatCatalog } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatCatalog)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatCatalog = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  prompts: S.Array(AiPrompt).pipe(S.mutable, S.mutableKey),
  threads: S.Array(AgentThreadSummary).pipe(S.mutable, S.mutableKey),
  history: S.Array(AgentThreadSummary).pipe(S.mutable, S.mutableKey),
  sources: S.Record(S.String, ExtensionChatVideo.pipe(S.mutableKey)).pipe(S.mutableKey),
  statuses: S.Record(
    S.String,
    S.Struct({
      status: S.Union([AgentRunStatus, S.Literal('idle')]).pipe(S.mutableKey),
      updatedAt: S.Finite.pipe(S.mutableKey)
    }).pipe(S.mutableKey)
  ).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatCatalog', {
    description: 'ExtensionChatCatalog shared boundary data.'
  })
)
/** Decoded mutable ExtensionChatCatalog data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatCatalog
 */
export type ExtensionChatCatalog = typeof ExtensionChatCatalog.Type

/** ExtensionChatState shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatState input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatState } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatState)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatState = S.Struct({
  revision: S.Finite.pipe(S.mutableKey),
  catalog: ExtensionChatCatalog.pipe(S.mutableKey),
  thread: S.Union([AgentThread, S.Null]).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ExtensionChatState', { description: 'ExtensionChatState shared boundary data.' })
)
/** Decoded mutable ExtensionChatState data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatState
 */
export type ExtensionChatState = typeof ExtensionChatState.Type

/** ExtensionChatEvent shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ExtensionChatEvent input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ExtensionChatEvent } from './extension-chat.js'
 * strictEqual(S.is(ExtensionChatEvent)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExtensionChatEvent = S.Union([
  S.Struct({
    type: S.Literal('snapshot').pipe(S.mutableKey),
    state: ExtensionChatState.pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('agent').pipe(S.mutableKey),
    event: AgentRunEvent.pipe(S.mutableKey),
    source: ExtensionChatVideo.pipe(S.optional, S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('settings').pipe(S.mutableKey)
  }),
  S.Struct({
    type: S.Literal('task').pipe(S.mutableKey),
    id: S.String.pipe(S.mutableKey)
  })
]).pipe(
  $I.annoteSchema('ExtensionChatEvent', { description: 'ExtensionChatEvent shared boundary data.' })
)
/** Decoded mutable ExtensionChatEvent data.
 * @category type-level
 * @since 0.0.0
 * @example ExtensionChatEvent
 */
export type ExtensionChatEvent = typeof ExtensionChatEvent.Type
