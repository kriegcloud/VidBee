import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import { pipe } from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as O from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { AgentArtifact } from '../AgentAttachment.model.js'
import { recordFunction } from '../RecordFunction.js'
import { MermaidExportImage } from './mermaid-export.js'

const AgentSkillLabel = S.Struct({
  name: S.String.pipe(S.mutableKey),
  label: S.String.pipe(S.optional, S.mutableKey)
})
const $I = $DesktopId.create('shared/types/share-card')
/** CSS width of the branded share poster.  * @example SHARE_CARD_WIDTH
 * @category utilities
 * @since 0.0.0
 */
export const SHARE_CARD_WIDTH = 540

/** Hash route that mounts the hidden capture page instead of the app shell.  * @example SHARE_CAPTURE_HASH
 * @category utilities
 * @since 0.0.0
 */
export const SHARE_CAPTURE_HASH = '/share-capture'

/** Main → hidden renderer: paint this card.  * @example SHARE_CAPTURE_RENDER_CHANNEL
 * @category utilities
 * @since 0.0.0
 */
export const SHARE_CAPTURE_RENDER_CHANNEL = 'share-capture:render'

/** Hidden renderer → main: card box is stable.  * @example SHARE_CAPTURE_READY_CHANNEL
 * @category utilities
 * @since 0.0.0
 */
export const SHARE_CAPTURE_READY_CHANNEL = 'share-capture:ready'

/** ShareCaptionQuote shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ShareCaptionQuote input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareCaptionQuote } from './share-card.js'
 * strictEqual(S.is(ShareCaptionQuote)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ShareCaptionQuote = S.Struct({
  after: S.String.pipe(S.mutableKey),
  before: S.String.pipe(S.mutableKey),
  endMs: S.Finite.pipe(S.mutableKey),
  quote: S.String.pipe(S.mutableKey),
  startMs: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ShareCaptionQuote', { description: 'ShareCaptionQuote shared boundary data.' })
)
/** Decoded mutable ShareCaptionQuote data.
 * @category type-level
 * @since 0.0.0
 * @example ShareCaptionQuote
 */
export type ShareCaptionQuote = typeof ShareCaptionQuote.Type

/** SharePromptCardPayload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SharePromptCardPayload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SharePromptCardPayload } from './share-card.js'
 * strictEqual(S.is(SharePromptCardPayload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SharePromptCardPayload = S.Struct({
  artifacts: S.Array(AgentArtifact).pipe(S.mutable, S.optional, S.mutableKey),
  runId: S.String.pipe(S.optional, S.mutableKey),
  coverSrc: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  kind: S.Literal('prompt').pipe(S.mutableKey),
  markdown: S.String.pipe(S.mutableKey),
  promptTitle: S.String.pipe(S.mutableKey),
  sourceByline: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  sourceTitle: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  tagline: S.String.pipe(S.mutableKey),
  thinkingLabel: S.String.pipe(S.optional, S.mutableKey),
  userText: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  userSkills: S.Array(AgentSkillLabel).pipe(S.mutable, S.optional, S.mutableKey)
}).pipe(
  $I.annoteSchema('SharePromptCardPayload', {
    description: 'SharePromptCardPayload shared boundary data.'
  })
)
/** Decoded mutable SharePromptCardPayload data.
 * @category type-level
 * @since 0.0.0
 * @example SharePromptCardPayload
 */
export type SharePromptCardPayload = typeof SharePromptCardPayload.Type

/** ShareCaptionCardPayload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ShareCaptionCardPayload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareCaptionCardPayload } from './share-card.js'
 * strictEqual(S.is(ShareCaptionCardPayload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ShareCaptionCardPayload = S.Struct({
  coverSrc: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  durationMs: S.Finite.pipe(S.optional, S.mutableKey),
  kind: S.Literal('caption').pipe(S.mutableKey),
  quote: ShareCaptionQuote.pipe(S.mutableKey),
  sourceByline: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  sourceTitle: S.Union([S.String, S.Null]).pipe(S.optional, S.mutableKey),
  tagline: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ShareCaptionCardPayload', {
    description: 'ShareCaptionCardPayload shared boundary data.'
  })
)
/** Decoded mutable ShareCaptionCardPayload data.
 * @category type-level
 * @since 0.0.0
 * @example ShareCaptionCardPayload
 */
export type ShareCaptionCardPayload = typeof ShareCaptionCardPayload.Type

/** ShareCardPayload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ShareCardPayload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareCardPayload } from './share-card.js'
 * strictEqual(S.is(ShareCardPayload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ShareCardPayload = S.Union([ShareCaptionCardPayload, SharePromptCardPayload]).pipe(
  $I.annoteSchema('ShareCardPayload', { description: 'ShareCardPayload shared boundary data.' })
)
/** Decoded mutable ShareCardPayload data.
 * @category type-level
 * @since 0.0.0
 * @example ShareCardPayload
 */
export type ShareCardPayload = typeof ShareCardPayload.Type

/**
 * Join platform and channel for the line under the share-card title.
 *
 * @param platform Localized or brand platform name.
 * @param channel Uploader or channel name from the download.
 * structural for legacy construction.
 * **Example** (Reject invalid ShareBylineInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareBylineInput } from './share-card.js'
 * strictEqual(S.is(ShareBylineInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ShareBylineInput = S.Struct({
  platform: S.String.pipe(S.NullOr, S.optional),
  channel: S.String.pipe(S.NullOr, S.optional)
}).pipe(
  $I.annoteSchema('ShareBylineInput', {
    description: 'Source labels; structural for legacy construction.'
  })
)
/** ShareBylineInput shared contract.
 * @category utilities
 * @since 0.0.0
 * @example ShareBylineInput
 */
export type ShareBylineInput = typeof ShareBylineInput.Type
/** shareCardSourceByline shared contract.
 * @category utilities
 * @since 0.0.0
 * @example shareCardSourceByline
 */
export const shareCardSourceByline: {
  (): (input: ShareBylineInput) => string
  (input: ShareBylineInput): string
} = recordFunction(({ platform, channel }: ShareBylineInput): string => {
  const platformLabel = platform === undefined || platform === null ? '' : Str.trim(platform)
  const channelLabel = channel === undefined || channel === null ? '' : Str.trim(channel)
  const both = Boolean(platformLabel && channelLabel)
  if (both && Str.toLowerCase(platformLabel) !== Str.toLowerCase(channelLabel)) {
    return `${platformLabel} · ${channelLabel}`
  }
  return platformLabel || channelLabel
})

/**
 * User instruction printed on a prompt share card.
 *
 * Auto-started runs store the prompt name as the user bubble; skip that so the
 * card does not print the prompt name.
 *
 * @param messages Thread messages, including the shared assistant reply.
 * @param assistantId Shared assistant message id.
 * @param promptTitle Localized prompt name, omitted from the card.
 * @param promptName Unlocalized prompt title stored on the first user bubble.
 * structural for legacy construction.
 * **Example** (Reject invalid SharePromptUserInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SharePromptUserInput } from './share-card.js'
 * strictEqual(S.is(SharePromptUserInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const SharePromptUserInput = S.Struct({
  messages: S.Array(
    S.Struct({ id: S.String, parentId: S.NullOr(S.String), role: S.String, text: S.String })
  ).pipe(S.mutable),
  assistantId: S.String,
  promptTitle: S.String.pipe(S.NullOr, S.optional),
  promptName: S.String.pipe(S.NullOr, S.optional)
}).pipe(
  $I.annoteSchema('SharePromptUserInput', {
    description: 'Instruction projection; structural for legacy construction.'
  })
)
/** SharePromptUserInput shared contract.
 * @category utilities
 * @since 0.0.0
 * @example SharePromptUserInput
 */
export type SharePromptUserInput = typeof SharePromptUserInput.Type
/** sharePromptUserText shared contract.
 * @category utilities
 * @since 0.0.0
 * @example sharePromptUserText
 */
export const sharePromptUserText: {
  (): (input: SharePromptUserInput) => string | undefined
  (input: SharePromptUserInput): string | undefined
} = recordFunction(
  ({
    messages,
    assistantId,
    promptTitle,
    promptName
  }: SharePromptUserInput): string | undefined => {
    const assistant = pipe(
      messages,
      A.findFirst((message) => message.id === assistantId),
      O.getOrUndefined
    )
    const user = pipe(
      messages,
      A.findFirst((message) => message.id === assistant?.parentId && message.role === 'user'),
      O.getOrUndefined
    )
    const text = user === undefined ? '' : Str.trim(user.text)
    if (text.length === 0) {
      return undefined
    }
    const aliases = HashSet.fromIterable(
      A.filter(
        A.map([promptTitle, promptName], (item) =>
          item === undefined || item === null ? undefined : Str.trim(item)
        ),
        (item): item is string => Boolean(item)
      )
    )
    if (HashSet.has(aliases, text)) {
      return undefined
    }
    return text
  }
)

/** ShareCaptureRenderMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ShareCaptureRenderMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareCaptureRenderMessage } from './share-card.js'
 * strictEqual(S.is(ShareCaptureRenderMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ShareCaptureRenderMessage = S.Struct({
  payload: ShareCardPayload.pipe(S.mutableKey),
  requestId: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ShareCaptureRenderMessage', {
    description: 'ShareCaptureRenderMessage shared boundary data.'
  })
)
/** Decoded mutable ShareCaptureRenderMessage data.
 * @category type-level
 * @since 0.0.0
 * @example ShareCaptureRenderMessage
 */
export type ShareCaptureRenderMessage = typeof ShareCaptureRenderMessage.Type

/** ShareImageLayout shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ShareImageLayout input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareImageLayout } from './share-card.js'
 * strictEqual(S.is(ShareImageLayout)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ShareImageLayout = S.Struct({
  width: S.Finite.pipe(S.mutableKey),
  height: S.Finite.pipe(S.mutableKey),
  padding: S.Finite.pipe(S.mutableKey),
  footerTop: S.Finite.pipe(S.optional, S.mutableKey),
  safeBreaks: S.Array(S.Finite).pipe(S.mutable, S.mutableKey),
  preferredBreaks: S.Array(S.Finite).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('ShareImageLayout', { description: 'ShareImageLayout shared boundary data.' })
)
/** Decoded mutable ShareImageLayout data.
 * @category type-level
 * @since 0.0.0
 * @example ShareImageLayout
 */
export type ShareImageLayout = typeof ShareImageLayout.Type

/** ShareCaptureReadyMessage shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid ShareCaptureReadyMessage input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { ShareCaptureReadyMessage } from './share-card.js'
 * strictEqual(S.is(ShareCaptureReadyMessage)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ShareCaptureReadyMessage = S.Struct({
  diagram: MermaidExportImage.pipe(S.optional, S.mutableKey),
  error: S.String.pipe(S.optional, S.mutableKey),
  layout: ShareImageLayout.pipe(S.optional, S.mutableKey),
  height: S.Finite.pipe(S.mutableKey),
  requestId: S.Finite.pipe(S.mutableKey),
  width: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('ShareCaptureReadyMessage', {
    description: 'ShareCaptureReadyMessage shared boundary data.'
  })
)
/** Decoded mutable ShareCaptureReadyMessage data.
 * @category type-level
 * @since 0.0.0
 * @example ShareCaptureReadyMessage
 */
export type ShareCaptureReadyMessage = typeof ShareCaptureReadyMessage.Type

/**
 * True when the renderer URL is the hidden share-capture page.
 *
 * @param hash `location.hash`, with or without a leading `#`.
 * @example isShareCaptureHash
 * @category utilities
 * @since 0.0.0
 */
export const isShareCaptureHash = (hash: string): boolean =>
  pipe(hash, Str.replace(/^#/, ''), Str.split('?'))[0] === SHARE_CAPTURE_HASH
