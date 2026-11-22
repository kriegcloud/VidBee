import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { recordFunction } from '../RecordFunction.js'
import { type DownloadItem, DownloadOptions } from '../types/Desktop.model.js'

const $I = $DesktopId.create('shared/utils/pending-download')
/** Pending row construction parameters; structural for legacy construction.
 * **Example** (Reject invalid PendingDownloadInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { PendingDownloadInput } from './pending-download.js'
 * strictEqual(S.is(PendingDownloadInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PendingDownloadInput = S.Struct({
  id: S.String,
  options: DownloadOptions,
  now: S.Finite
}).pipe(
  $I.annoteSchema('PendingDownloadInput', {
    description: 'Pending row with an explicit admission timestamp.'
  })
)
/** PendingDownloadInput shared contract.
 * @category utilities
 * @since 0.0.0
 * @example PendingDownloadInput
 */
export type PendingDownloadInput = typeof PendingDownloadInput.Type

/**
 * True when a caller already provided enough video metadata for list rendering.
 * @example hasDisplayMetadata
 * @category utilities
 * @since 0.0.0
 */
export const hasDisplayMetadata = (
  options: Pick<DownloadOptions, 'title' | 'thumbnail'>
): boolean =>
  Boolean(
    (options.title === undefined || options.title === null ? undefined : Str.trim(options.title)) &&
      (options.thumbnail === undefined || options.thumbnail === null
        ? undefined
        : Str.trim(options.thumbnail))
  )

/**
 * Build the pending row shown as soon as a download is accepted, before
 * yt-dlp metadata hydration finishes.
 * @example buildPendingDownloadItem
 * @category utilities
 * @since 0.0.0
 */
export const buildPendingDownloadItem: {
  (): (input: PendingDownloadInput) => DownloadItem
  (input: PendingDownloadInput): DownloadItem
} = recordFunction(({ id, options, now }: PendingDownloadInput): DownloadItem => {
  const title =
    options.title === undefined || options.title === null ? undefined : Str.trim(options.title)
  const item: DownloadItem = {
    id,
    url: options.url,
    title: title || options.url,
    type: options.type,
    status: 'pending',
    progress: { percent: 0 },
    createdAt: now
  }
  const hasthumbnail = Boolean(options.thumbnail)
  if (hasthumbnail) {
    item.thumbnail = options.thumbnail
  }
  const hasdescription = Boolean(options.description)
  if (hasdescription) {
    item.description = options.description
  }
  const haschannel = Boolean(options.channel)
  if (haschannel) {
    item.channel = options.channel
  }
  const hasuploader = Boolean(options.uploader)
  if (hasuploader) {
    item.uploader = options.uploader
  }
  if (options.viewCount !== undefined) {
    item.viewCount = options.viewCount
  }
  if (options.duration !== undefined) {
    item.duration = options.duration
  }
  const hasselectedFormat = Boolean(options.selectedFormat)
  if (hasselectedFormat) {
    item.selectedFormat = options.selectedFormat
  }
  const hasorigin = Boolean(options.origin)
  if (hasorigin) {
    item.origin = options.origin
  }
  const hassubscriptionId = Boolean(options.subscriptionId)
  if (hassubscriptionId) {
    item.subscriptionId = options.subscriptionId
  }
  const hastags = Boolean(options.tags)
  if (hastags) {
    item.tags = options.tags
  }
  return item
})
