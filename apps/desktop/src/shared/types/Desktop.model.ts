import { FilenameStyle } from '@vidbee/downloader-core/filename-style'
import { OneClickContainerOption } from '@vidbee/downloader-core/format-preferences'
import { SocialMediaOptionsSchema as SocialMediaOptions } from '@vidbee/downloader-core/social-media'
import { LanguageCode } from '@vidbee/i18n'
import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import {
  SubscriptionDownloadPreferences,
  SubscriptionPlatform,
  SubscriptionSourceKind,
  SubscriptionStatus
} from '@vidbee/subscriptions-core/Subscription.model'
import {
  DownloadCookieSource,
  SocialCollectionSummary,
  TaskCreationMetadata,
  TaskKind
} from '@vidbee/task-queue/Task.model'
import { AsrTierId, TranscriptionProvider } from '@vidbee/transcription/Literal.model'
import { DownloadMirror } from '@vidbee/transcription/Mirror.model'
import * as S from 'effect/Schema'
import { AgentPermissionMode } from '../agent-permissions.js'
import { ExtensionCookieSourcePreference } from '../extension-cookies.js'
import { TtsModelId } from '../Tts.model.js'

const $I = $DesktopId.create('shared/types/Desktop.model')
/** VideoFormat shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid VideoFormat input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { VideoFormat } from './Desktop.model.js'
 * strictEqual(S.is(VideoFormat)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const VideoFormat = S.Struct({
  format_id: S.String.pipe(S.mutableKey),
  ext: S.String.pipe(S.mutableKey),
  height: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  width: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  fps: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  vcodec: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  acodec: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  filesize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  filesize_approx: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  format_note: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  video_ext: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  audio_ext: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tbr: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  quality: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  protocol: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  language: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe($I.annoteSchema('VideoFormat', { description: 'VideoFormat shared boundary data.' }))
/** Decoded mutable VideoFormat data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the VideoFormat contract)
 *
 * ```ts
 * import { VideoFormat } from './Desktop.model.js'
 * void VideoFormat
 * ```
 *
 */
export type VideoFormat = typeof VideoFormat.Type

/** VideoInfo shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid VideoInfo input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { VideoInfo } from './Desktop.model.js'
 * strictEqual(S.is(VideoInfo)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const VideoInfo = S.Struct({
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  duration: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  formats: S.Array(VideoFormat).pipe(S.mutable, S.mutableKey),
  extractor_key: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  webpage_url: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  view_count: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  uploader: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe($I.annoteSchema('VideoInfo', { description: 'VideoInfo shared boundary data.' }))
/** Decoded mutable VideoInfo data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the VideoInfo contract)
 *
 * ```ts
 * import { VideoInfo } from './Desktop.model.js'
 * void VideoInfo
 * ```
 *
 */
export type VideoInfo = typeof VideoInfo.Type

/** VideoInfoCommandResult shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid VideoInfoCommandResult input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { VideoInfoCommandResult } from './Desktop.model.js'
 * strictEqual(S.is(VideoInfoCommandResult)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const VideoInfoCommandResult = S.Struct({
  info: VideoInfo.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  ytDlpCommand: S.String.pipe(S.mutableKey),
  error: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('VideoInfoCommandResult', {
    description: 'VideoInfoCommandResult shared boundary data.'
  })
)
/** Decoded mutable VideoInfoCommandResult data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the VideoInfoCommandResult contract)
 *
 * ```ts
 * import { VideoInfoCommandResult } from './Desktop.model.js'
 * void VideoInfoCommandResult
 * ```
 *
 */
export type VideoInfoCommandResult = typeof VideoInfoCommandResult.Type

/** DownloadProgress shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DownloadProgress input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DownloadProgress } from './Desktop.model.js'
 * strictEqual(S.is(DownloadProgress)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloadProgress = S.Struct({
  percent: S.Finite.pipe(S.mutableKey),
  indeterminate: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  currentSpeed: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  eta: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloaded: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  total: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('DownloadProgress', { description: 'DownloadProgress shared boundary data.' })
)
/** Decoded mutable DownloadProgress data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DownloadProgress contract)
 *
 * ```ts
 * import { DownloadProgress } from './Desktop.model.js'
 * void DownloadProgress
 * ```
 *
 */
export type DownloadProgress = typeof DownloadProgress.Type

/** DownloadStatus shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DownloadStatus input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DownloadStatus } from './Desktop.model.js'
 * strictEqual(S.is(DownloadStatus)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloadStatus = LiteralKit([
  'pending',
  'downloading',
  'processing',
  'completed',
  'error',
  'cancelled'
]).pipe($I.annoteSchema('DownloadStatus', { description: 'DownloadStatus shared boundary data.' }))
/** Decoded mutable DownloadStatus data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DownloadStatus contract)
 *
 * ```ts
 * import { DownloadStatus } from './Desktop.model.js'
 * void DownloadStatus
 * ```
 *
 */
export type DownloadStatus = typeof DownloadStatus.Type

/** DownloadItem shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DownloadItem input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DownloadItem } from './Desktop.model.js'
 * strictEqual(S.is(DownloadItem)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloadItem = S.Struct({
  sourceMediaKind: LiteralKit(['image', 'video', 'mixed']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  collectionSummary: SocialCollectionSummary.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  cookieSources: S.Array(DownloadCookieSource).pipe(
    S.mutable,
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  configuredCookieSources: S.Array(DownloadCookieSource).pipe(
    S.mutable,
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  type: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  status: DownloadStatus.pipe(S.mutableKey),
  progress: DownloadProgress.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  error: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  speed: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  ytDlpCommand: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  ytDlpLog: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  duration: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  fileSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  savedFileName: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  filePath: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  createdAt: S.Finite.pipe(S.mutableKey),
  startedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  completedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  channel: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  uploader: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  viewCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  origin: TaskCreationMetadata.fields.origin.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  agentConversation: TaskCreationMetadata.fields.agentConversation.pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  parentId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  taskKind: TaskKind.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  subscriptionId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  selectedFormat: VideoFormat.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  resolvedFormatId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  subtitleStatus: LiteralKit(['downloaded', 'unavailable', 'skipped-auth', 'failed']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  subtitleLanguages: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistTitle: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistIndex: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  mediaKind: LiteralKit(['photo', 'video', 'recording']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  batchId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchKind: LiteralKit(['instagram-profile', 'social-media']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  batchTitle: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchCategory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchOrder: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchSourceCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchAssetCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  outputDirectory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  fileCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloadedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  skippedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  failedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  totalSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  internalStatus: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  subStatus: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  statusReason: S.Union([S.String, S.Null]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  nextRetryAt: S.Union([S.Finite, S.Null]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  attempt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  maxAttempts: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  errorCategory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe($I.annoteSchema('DownloadItem', { description: 'DownloadItem shared boundary data.' }))
/** Decoded mutable DownloadItem data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DownloadItem contract)
 *
 * ```ts
 * import { DownloadItem } from './Desktop.model.js'
 * void DownloadItem
 * ```
 *
 */
export type DownloadItem = typeof DownloadItem.Type

/** SubscriptionFeedItem shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SubscriptionFeedItem input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubscriptionFeedItem } from './Desktop.model.js'
 * strictEqual(S.is(SubscriptionFeedItem)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionFeedItem = S.Struct({
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  publishedAt: S.Finite.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  addedToQueue: S.Boolean.pipe(S.mutableKey),
  downloadId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('SubscriptionFeedItem', {
    description: 'SubscriptionFeedItem shared boundary data.'
  })
)
/** Decoded mutable SubscriptionFeedItem data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the SubscriptionFeedItem contract)
 *
 * ```ts
 * import { SubscriptionFeedItem } from './Desktop.model.js'
 * void SubscriptionFeedItem
 * ```
 *
 */
export type SubscriptionFeedItem = typeof SubscriptionFeedItem.Type

/** DownloadHistoryItem shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DownloadHistoryItem input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DownloadHistoryItem } from './Desktop.model.js'
 * strictEqual(S.is(DownloadHistoryItem)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloadHistoryItem = S.Struct({
  sourceMediaKind: LiteralKit(['image', 'video', 'mixed']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  collectionSummary: SocialCollectionSummary.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  cookieSources: S.Array(DownloadCookieSource).pipe(
    S.mutable,
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  configuredCookieSources: S.Array(DownloadCookieSource).pipe(
    S.mutable,
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  type: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  status: DownloadStatus.pipe(S.mutableKey),
  downloadPath: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  savedFileName: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  filePath: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  resolvedFormatId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  subtitleStatus: LiteralKit(['downloaded', 'unavailable', 'skipped-auth', 'failed']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  subtitleLanguages: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  fileSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  duration: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloadedAt: S.Finite.pipe(S.mutableKey),
  createdAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  startedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  completedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  error: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  ytDlpCommand: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  ytDlpLog: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  channel: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  uploader: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  viewCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  origin: TaskCreationMetadata.fields.origin.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  agentConversation: TaskCreationMetadata.fields.agentConversation.pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  parentId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  taskKind: TaskKind.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  subscriptionId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  selectedFormat: VideoFormat.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistTitle: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistIndex: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  playlistSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  mediaKind: LiteralKit(['photo', 'video', 'recording']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  batchId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchKind: LiteralKit(['instagram-profile', 'social-media']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  ),
  batchTitle: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchCategory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchOrder: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchSourceCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchAssetCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  outputDirectory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  fileCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloadedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  skippedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  failedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  totalSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('DownloadHistoryItem', {
    description: 'DownloadHistoryItem shared boundary data.'
  })
)
/** Decoded mutable DownloadHistoryItem data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DownloadHistoryItem contract)
 *
 * ```ts
 * import { DownloadHistoryItem } from './Desktop.model.js'
 * void DownloadHistoryItem
 * ```
 *
 */
export type DownloadHistoryItem = typeof DownloadHistoryItem.Type

/** DownloadOptions shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DownloadOptions input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DownloadOptions } from './Desktop.model.js'
 * strictEqual(S.is(DownloadOptions)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloadOptions = S.Struct({
  batchId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchTitle: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  batchOrder: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  socialMedia: SocialMediaOptions.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  singleVideo: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  type: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  format: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  audioFormat: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  audioFormatIds: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  startTime: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  endTime: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  downloadSubs: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  customDownloadPath: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  customFilenameTemplate: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  containerFormat: OneClickContainerOption.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  origin: TaskCreationMetadata.fields.origin.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  subscriptionId: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  title: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  channel: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  uploader: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  viewCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  duration: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  selectedFormat: VideoFormat.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('DownloadOptions', { description: 'DownloadOptions shared boundary data.' })
)
/** Decoded mutable DownloadOptions data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the DownloadOptions contract)
 *
 * ```ts
 * import { DownloadOptions } from './Desktop.model.js'
 * void DownloadOptions
 * ```
 *
 */
export type DownloadOptions = typeof DownloadOptions.Type

/** PlaylistEntry shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid PlaylistEntry input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PlaylistEntry } from './Desktop.model.js'
 * strictEqual(S.is(PlaylistEntry)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PlaylistEntry = S.Struct({
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  index: S.Finite.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  mediaKind: LiteralKit(['photo', 'video', 'recording']).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe($I.annoteSchema('PlaylistEntry', { description: 'PlaylistEntry shared boundary data.' }))
/** Decoded mutable PlaylistEntry data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlaylistEntry contract)
 *
 * ```ts
 * import { PlaylistEntry } from './Desktop.model.js'
 * void PlaylistEntry
 * ```
 *
 */
export type PlaylistEntry = typeof PlaylistEntry.Type

/** PlaylistInfo shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid PlaylistInfo input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PlaylistInfo } from './Desktop.model.js'
 * strictEqual(S.is(PlaylistInfo)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PlaylistInfo = S.Struct({
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  entries: S.Array(PlaylistEntry).pipe(S.mutable, S.mutableKey),
  entryCount: S.Finite.pipe(S.mutableKey)
}).pipe($I.annoteSchema('PlaylistInfo', { description: 'PlaylistInfo shared boundary data.' }))
/** Decoded mutable PlaylistInfo data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlaylistInfo contract)
 *
 * ```ts
 * import { PlaylistInfo } from './Desktop.model.js'
 * void PlaylistInfo
 * ```
 *
 */
export type PlaylistInfo = typeof PlaylistInfo.Type

/** PlaylistDownloadOptions shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid PlaylistDownloadOptions input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PlaylistDownloadOptions } from './Desktop.model.js'
 * strictEqual(S.is(PlaylistDownloadOptions)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PlaylistDownloadOptions = S.Struct({
  url: S.String.pipe(S.mutableKey),
  type: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  format: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  entryIds: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  startIndex: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  endIndex: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  filenameFormat: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  folderFormat: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  customDownloadPath: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  containerFormat: OneClickContainerOption.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('PlaylistDownloadOptions', {
    description: 'PlaylistDownloadOptions shared boundary data.'
  })
)
/** Decoded mutable PlaylistDownloadOptions data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlaylistDownloadOptions contract)
 *
 * ```ts
 * import { PlaylistDownloadOptions } from './Desktop.model.js'
 * void PlaylistDownloadOptions
 * ```
 *
 */
export type PlaylistDownloadOptions = typeof PlaylistDownloadOptions.Type

/** PlaylistDownloadEntry shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid PlaylistDownloadEntry input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PlaylistDownloadEntry } from './Desktop.model.js'
 * strictEqual(S.is(PlaylistDownloadEntry)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PlaylistDownloadEntry = S.Struct({
  downloadId: S.String.pipe(S.mutableKey),
  entryId: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  index: S.Finite.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('PlaylistDownloadEntry', {
    description: 'PlaylistDownloadEntry shared boundary data.'
  })
)
/** Decoded mutable PlaylistDownloadEntry data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlaylistDownloadEntry contract)
 *
 * ```ts
 * import { PlaylistDownloadEntry } from './Desktop.model.js'
 * void PlaylistDownloadEntry
 * ```
 *
 */
export type PlaylistDownloadEntry = typeof PlaylistDownloadEntry.Type

/** PlaylistDownloadResult shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid PlaylistDownloadResult input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PlaylistDownloadResult } from './Desktop.model.js'
 * strictEqual(S.is(PlaylistDownloadResult)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PlaylistDownloadResult = S.Struct({
  groupId: S.String.pipe(S.mutableKey),
  playlistId: S.String.pipe(S.mutableKey),
  playlistTitle: S.String.pipe(S.mutableKey),
  type: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  totalCount: S.Finite.pipe(S.mutableKey),
  startIndex: S.Finite.pipe(S.mutableKey),
  endIndex: S.Finite.pipe(S.mutableKey),
  entries: S.Array(PlaylistDownloadEntry).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('PlaylistDownloadResult', {
    description: 'PlaylistDownloadResult shared boundary data.'
  })
)
/** Decoded mutable PlaylistDownloadResult data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlaylistDownloadResult contract)
 *
 * ```ts
 * import { PlaylistDownloadResult } from './Desktop.model.js'
 * void PlaylistDownloadResult
 * ```
 *
 */
export type PlaylistDownloadResult = typeof PlaylistDownloadResult.Type

/** SubscriptionRule shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SubscriptionRule input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubscriptionRule } from './Desktop.model.js'
 * strictEqual(S.is(SubscriptionRule)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionRule = S.Struct({
  ...SubscriptionDownloadPreferences.fields,
  ...S.Struct({
    id: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey),
    sourceUrl: S.String.pipe(S.mutableKey),
    feedUrl: S.String.pipe(S.mutableKey),
    platform: SubscriptionPlatform.pipe(S.mutableKey),
    keywords: S.Array(S.String).pipe(S.mutable, S.mutableKey),
    tags: S.Array(S.String).pipe(S.mutable, S.mutableKey),
    onlyDownloadLatest: S.Boolean.pipe(S.mutableKey),
    autoDownload: S.Boolean.pipe(S.mutableKey),
    enabled: S.Boolean.pipe(S.mutableKey),
    coverUrl: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    latestVideoTitle: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    latestVideoPublishedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    lastCheckedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    lastSuccessAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    status: SubscriptionStatus.pipe(S.mutableKey),
    lastError: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    createdAt: S.Finite.pipe(S.mutableKey),
    updatedAt: S.Finite.pipe(S.mutableKey),
    downloadDirectory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    namingTemplate: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    sourceKind: SubscriptionSourceKind.pipe(S.mutableKey),
    profileOwner: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    categories: S.Array(S.String).pipe(S.mutable, S.mutableKey),
    checkIntervalMs: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    nextCheckAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    items: S.Array(SubscriptionFeedItem).pipe(S.mutable, S.mutableKey)
  }).fields
}).pipe(
  $I.annoteSchema('SubscriptionRule', { description: 'SubscriptionRule shared boundary data.' })
)
/** Decoded mutable SubscriptionRule data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the SubscriptionRule contract)
 *
 * ```ts
 * import { SubscriptionRule } from './Desktop.model.js'
 * void SubscriptionRule
 * ```
 *
 */
export type SubscriptionRule = typeof SubscriptionRule.Type

/** SubscriptionResolvedFeed shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SubscriptionResolvedFeed input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubscriptionResolvedFeed } from './Desktop.model.js'
 * strictEqual(S.is(SubscriptionResolvedFeed)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionResolvedFeed = S.Struct({
  sourceUrl: S.String.pipe(S.mutableKey),
  feedUrl: S.String.pipe(S.mutableKey),
  platform: SubscriptionPlatform.pipe(S.mutableKey),
  sourceKind: SubscriptionSourceKind.pipe(S.mutableKey),
  profileOwner: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  availableCategories: S.Array(S.String).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('SubscriptionResolvedFeed', {
    description: 'SubscriptionResolvedFeed shared boundary data.'
  })
)
/** Decoded mutable SubscriptionResolvedFeed data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the SubscriptionResolvedFeed contract)
 *
 * ```ts
 * import { SubscriptionResolvedFeed } from './Desktop.model.js'
 * void SubscriptionResolvedFeed
 * ```
 *
 */
export type SubscriptionResolvedFeed = typeof SubscriptionResolvedFeed.Type

/** SubscriptionCreatePayload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SubscriptionCreatePayload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubscriptionCreatePayload } from './Desktop.model.js'
 * strictEqual(S.is(SubscriptionCreatePayload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionCreatePayload = S.Struct({
  ...SubscriptionDownloadPreferences.fields,
  ...S.Struct({
    sourceUrl: S.String.pipe(S.mutableKey),
    feedUrl: S.String.pipe(S.mutableKey),
    platform: SubscriptionPlatform.pipe(S.mutableKey),
    keywords: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
    tags: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
    onlyDownloadLatest: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    autoDownload: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    downloadDirectory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    namingTemplate: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    enabled: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    sourceKind: SubscriptionSourceKind.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    profileOwner: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    categories: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
    checkIntervalMs: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
  }).fields
}).pipe(
  $I.annoteSchema('SubscriptionCreatePayload', {
    description: 'SubscriptionCreatePayload shared boundary data.'
  })
)
/** Decoded mutable SubscriptionCreatePayload data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the SubscriptionCreatePayload contract)
 *
 * ```ts
 * import { SubscriptionCreatePayload } from './Desktop.model.js'
 * void SubscriptionCreatePayload
 * ```
 *
 */
export type SubscriptionCreatePayload = typeof SubscriptionCreatePayload.Type

/** SubscriptionUpdatePayload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid SubscriptionUpdatePayload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubscriptionUpdatePayload } from './Desktop.model.js'
 * strictEqual(S.is(SubscriptionUpdatePayload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionUpdatePayload = S.Struct({
  ...SubscriptionDownloadPreferences.fields,
  ...S.Struct({
    title: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    sourceUrl: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    feedUrl: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    platform: SubscriptionPlatform.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    keywords: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
    tags: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
    onlyDownloadLatest: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    autoDownload: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    enabled: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    downloadDirectory: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    namingTemplate: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    categories: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
    checkIntervalMs: S.Union([S.Finite, S.Null]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
    items: S.Array(SubscriptionFeedItem).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey)
  }).fields
}).pipe(
  $I.annoteSchema('SubscriptionUpdatePayload', {
    description: 'SubscriptionUpdatePayload shared boundary data.'
  })
)
/** Decoded mutable SubscriptionUpdatePayload data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the SubscriptionUpdatePayload contract)
 *
 * ```ts
 * import { SubscriptionUpdatePayload } from './Desktop.model.js'
 * void SubscriptionUpdatePayload
 * ```
 *
 */
export type SubscriptionUpdatePayload = typeof SubscriptionUpdatePayload.Type

/** OneClickQualityPreset shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid OneClickQualityPreset input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { OneClickQualityPreset } from './Desktop.model.js'
 * strictEqual(S.is(OneClickQualityPreset)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const OneClickQualityPreset = LiteralKit(['best', 'good', 'normal', 'bad', 'worst']).pipe(
  $I.annoteSchema('OneClickQualityPreset', {
    description: 'OneClickQualityPreset shared boundary data.'
  })
)
/** Decoded mutable OneClickQualityPreset data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the OneClickQualityPreset contract)
 *
 * ```ts
 * import { OneClickQualityPreset } from './Desktop.model.js'
 * void OneClickQualityPreset
 * ```
 *
 */
export type OneClickQualityPreset = typeof OneClickQualityPreset.Type

/** AppSettings shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AppSettings input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AppSettings } from './Desktop.model.js'
 * strictEqual(S.is(AppSettings)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AppSettings = S.Struct({
  downloadPath: S.String.pipe(S.mutableKey),
  maxConcurrentDownloads: S.Finite.pipe(S.mutableKey),
  downloadWithoutChannelSubfolders: S.Boolean.pipe(S.mutableKey),
  browserForCookies: S.String.pipe(S.mutableKey),
  cookiesPath: S.String.pipe(S.mutableKey),
  extensionCookieSources: S.Array(ExtensionCookieSourcePreference).pipe(S.mutable, S.mutableKey),
  proxy: S.String.pipe(S.mutableKey),
  configPath: S.String.pipe(S.mutableKey),
  language: LanguageCode.pipe(S.mutableKey),
  theme: S.String.pipe(S.mutableKey),
  oneClickDownload: S.Boolean.pipe(S.mutableKey),
  oneClickDownloadType: LiteralKit(['video', 'audio']).pipe(S.mutableKey),
  oneClickQuality: OneClickQualityPreset.pipe(S.mutableKey),
  oneClickContainer: OneClickContainerOption.pipe(S.mutableKey),
  closeToTray: S.Boolean.pipe(S.mutableKey),
  hideDockIcon: S.Boolean.pipe(S.mutableKey),
  launchAtLogin: S.Boolean.pipe(S.mutableKey),
  subscriptionOnlyLatestDefault: S.Boolean.pipe(S.mutableKey),
  enableDownloadNotifications: S.Boolean.pipe(S.mutableKey),
  rememberLastAudioLanguage: S.Boolean.pipe(S.mutableKey),
  preferredAudioLanguage: S.String.pipe(S.mutableKey),
  downloadSubtitles: S.Boolean.pipe(S.mutableKey),
  subtitleLanguages: S.Array(S.String).pipe(S.mutable, S.mutableKey),
  embedSubs: S.Boolean.pipe(S.mutableKey),
  writeAutoSubs: S.Boolean.pipe(S.mutableKey),
  embedThumbnail: S.Boolean.pipe(S.mutableKey),
  embedMetadata: S.Boolean.pipe(S.mutableKey),
  embedChapters: S.Boolean.pipe(S.mutableKey),
  filenameStyle: FilenameStyle.pipe(S.mutableKey),
  filenameViaVidBee: S.Boolean.pipe(S.mutableKey),
  shareWatermark: S.Boolean.pipe(S.mutableKey),
  sequentialFilenames: S.Boolean.pipe(S.mutableKey),
  autoTranscribeAfterDownload: S.Boolean.pipe(S.mutableKey),
  maxConcurrentTranscriptions: S.Finite.pipe(S.mutableKey),
  asrTier: AsrTierId.pipe(S.mutableKey),
  ttsModelId: TtsModelId.pipe(S.mutableKey),
  transcriptionProvider: TranscriptionProvider.pipe(S.mutableKey),
  cloudTranscriptionModelId: S.String.pipe(S.mutableKey),
  downloadMirror: DownloadMirror.pipe(S.mutableKey),
  lastSeenWhatsNew: S.String.pipe(S.mutableKey),
  agentManagementTools: AgentPermissionMode.pipe(S.mutableKey)
}).pipe($I.annoteSchema('AppSettings', { description: 'AppSettings shared boundary data.' }))
/** Decoded mutable AppSettings data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AppSettings contract)
 *
 * ```ts
 * import { AppSettings } from './Desktop.model.js'
 * void AppSettings
 * ```
 *
 */
export type AppSettings = typeof AppSettings.Type
