import * as A from 'effect/Array'
import { dual } from 'effect/Function'
import * as O from 'effect/Option'
import * as Order from 'effect/Order'
import * as P from 'effect/Predicate'
import type { AppSettings, DownloadOptions, VideoFormat, VideoInfo } from '../types'

type VideoInfoDownloadMetadata = Pick<
  DownloadOptions,
  'title' | 'thumbnail' | 'description' | 'channel' | 'uploader' | 'viewCount' | 'duration'
>
const qualityPresetToVideoHeight: Record<AppSettings['oneClickQuality'], number | null> = {
  best: null,
  good: 1080,
  normal: 720,
  bad: 480,
  worst: 360
}
const qualityPresetToAudioBitrate: Record<AppSettings['oneClickQuality'], number | null> = {
  best: 320,
  good: 256,
  normal: 192,
  bad: 128,
  worst: 96
}
const getFormatSize = (format: VideoFormat): number =>
  format.filesize ?? format.filesize_approx ?? 0
const isVideoFormat = (format: VideoFormat): boolean =>
  P.isTruthy(format.vcodec && format.vcodec !== 'none')
const isAudioOnlyFormat = (format: VideoFormat): boolean =>
  P.isTruthy(
    format.acodec &&
      format.acodec !== 'none' &&
      (format.video_ext === 'none' ||
        !P.isTruthy(format.video_ext) ||
        !P.isTruthy(format.vcodec) ||
        format.vcodec === 'none')
  )
const sortVideoFormatsByQuality = (a: VideoFormat, b: VideoFormat): number => {
  const heightDiff = (b.height ?? 0) - (a.height ?? 0)
  if (heightDiff !== 0) {
    return heightDiff
  }
  const fpsDiff = (b.fps ?? 0) - (a.fps ?? 0)
  if (fpsDiff !== 0) {
    return fpsDiff
  }
  const aHasSize = P.isTruthy(a.filesize || a.filesize_approx)
  const bHasSize = P.isTruthy(b.filesize || b.filesize_approx)
  if (aHasSize !== bHasSize) {
    return bHasSize ? 1 : -1
  }
  return getFormatSize(b) - getFormatSize(a)
}
const sortAudioFormatsByQuality = (a: VideoFormat, b: VideoFormat): number => {
  const bitrateDiff = (b.tbr ?? 0) - (a.tbr ?? 0)
  if (bitrateDiff !== 0) {
    return bitrateDiff
  }
  return getFormatSize(b) - getFormatSize(a)
}

/** Builds the metadata fields that should survive a download task projection.
 *
 * **Example** (Access the buildVideoInfoDownloadMetadata contract)
 *
 * ```ts
 * import { buildVideoInfoDownloadMetadata } from './video-info-metadata.js'
 * void buildVideoInfoDownloadMetadata
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const buildVideoInfoDownloadMetadata = (
  videoInfo: VideoInfo | null | undefined
): VideoInfoDownloadMetadata => {
  const hasVideo = P.isTruthy(videoInfo)
  if (videoInfo === null || videoInfo === undefined || !hasVideo) {
    return {}
  }
  return {
    title: videoInfo.title,
    thumbnail: videoInfo.thumbnail,
    description: videoInfo.description,
    channel: videoInfo.extractor_key,
    uploader: videoInfo.uploader ?? videoInfo.extractor_key,
    viewCount: videoInfo.view_count,
    duration: videoInfo.duration
  }
}

/** Picks a display format that mirrors the one-click quality preset.
 *
 * **Example** (Access the pickOneClickSelectedFormat contract)
 *
 * ```ts
 * import { pickOneClickSelectedFormat } from './video-info-metadata.js'
 * void pickOneClickSelectedFormat
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const pickOneClickSelectedFormat: {
  (
    settings: Pick<AppSettings, 'oneClickDownloadType' | 'oneClickQuality'>
  ): (videoInfo: VideoInfo | null | undefined) => VideoFormat | undefined
  (
    videoInfo: VideoInfo | null | undefined,
    settings: Pick<AppSettings, 'oneClickDownloadType' | 'oneClickQuality'>
  ): VideoFormat | undefined
} = dual(
  2,
  (
    videoInfo: VideoInfo | null | undefined,
    settings: Pick<AppSettings, 'oneClickDownloadType' | 'oneClickQuality'>
  ): VideoFormat | undefined => {
    const formats = videoInfo?.formats ?? []
    if (settings.oneClickDownloadType === 'audio') {
      const sortedAudioFormats = A.sort(
        filterFormats(formats, isAudioOnlyFormat),
        Order.make<VideoFormat>((left, right) => {
          const difference = sortAudioFormatsByQuality(left, right)
          return difference < 0 ? -1 : difference > 0 ? 1 : 0
        })
      )
      if (sortedAudioFormats.length === 0) {
        return undefined
      }
      if (settings.oneClickQuality === 'worst') {
        return sortedAudioFormats.at(-1) ?? sortedAudioFormats[0]
      }
      const bitrateLimit = qualityPresetToAudioBitrate[settings.oneClickQuality]
      const matchingBitrate = A.findFirst(sortedAudioFormats, (format) => {
        const hasLimit = P.isTruthy(bitrateLimit && format.tbr)
        if (
          bitrateLimit === null ||
          bitrateLimit === undefined ||
          format.tbr === undefined ||
          !hasLimit
        ) {
          return false
        }
        return format.tbr <= bitrateLimit
      })
      return O.getOrUndefined(matchingBitrate) ?? sortedAudioFormats[0]
    }
    const sortedVideoFormats = A.sort(
      filterFormats(formats, isVideoFormat),
      Order.make<VideoFormat>((left, right) => {
        const difference = sortVideoFormatsByQuality(left, right)
        return difference < 0 ? -1 : difference > 0 ? 1 : 0
      })
    )
    if (sortedVideoFormats.length === 0) {
      return undefined
    }
    if (settings.oneClickQuality === 'worst') {
      return sortedVideoFormats.at(-1) ?? sortedVideoFormats[0]
    }
    const heightLimit = qualityPresetToVideoHeight[settings.oneClickQuality]
    const hasHeightLimit = P.isTruthy(heightLimit)
    if (heightLimit === null || heightLimit === undefined || !hasHeightLimit) {
      return sortedVideoFormats[0]
    }
    const matchingHeight = A.findFirst(sortedVideoFormats, (format) => {
      const hasHeight = P.isTruthy(format.height)
      if (format.height === undefined || !hasHeight) {
        return false
      }
      return format.height <= heightLimit
    })
    return O.getOrUndefined(matchingHeight) ?? sortedVideoFormats[0]
  }
)
const filterFormats = (
  formats: VideoFormat[],
  predicate: (format: VideoFormat) => boolean
): VideoFormat[] => {
  const output: VideoFormat[] = []
  for (const [index, format] of formats.entries()) {
    if (index in formats && predicate(format)) {
      output.push(format)
    }
  }
  return output
}
