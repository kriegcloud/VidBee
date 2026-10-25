import {
  GALLERY_DL_MAP_ARGS,
  type GalleryDlProfileMapRuntime,
  galleryDlUrlMetadata,
  runGalleryDlJson
} from './gallery-dl-json-run'
import { buildGalleryDlRuntimeArgs } from './instagram-profile'
import type { SocialMappedItem } from './social-media-service'
import {
  type SnapchatCategory,
  snapchatCategoryUrl,
  snapchatSpotlightUrl,
  snapchatStorySnapUrl
} from './snapchat'
import type { DownloadRuntimeSettings } from './types'

const RATE_LIMITED = /\b429\b|Too Many Requests/i

/** gallery-dl serializes `date` as UTC `YYYY-MM-DD HH:MM:SS`. */
export const parseGalleryDlDate = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return
  }
  const time = Date.parse(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(time) ? undefined : time
}

const mapSnapchatProfileUnchecked = async (
  owner: string,
  category: SnapchatCategory,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const url = snapchatCategoryUrl(owner, category)
  const onLine = (line: string) => {
    const metadata = galleryDlUrlMetadata(line)
    if (!metadata || metadata.vidbee_category !== category) {
      return
    }
    const fileId = metadata.file_id
    const spotlightId = metadata.spotlight_id
    const id = category === 'spotlight' ? spotlightId : fileId
    if (typeof id !== 'string' || !id) {
      return
    }
    const video = metadata.extension === 'mp4'
    const uploadMs = typeof metadata.upload_ms === 'number' ? metadata.upload_ms : 0
    const title =
      typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title.trim() : undefined
    const item: SocialMappedItem = {
      id,
      url:
        category === 'spotlight' ? snapchatSpotlightUrl(owner, id) : snapchatStorySnapUrl(owner, id),
      author: owner,
      images: video ? 0 : 1,
      videos: video ? 1 : 0
    }
    const publishedAt = uploadMs > 0 ? uploadMs : parseGalleryDlDate(metadata.date)
    if (publishedAt !== undefined) {
      item.publishedAt = publishedAt
    }
    if (title) {
      item.title = title
    }
    onItem(item)
  }
  const extraArgs =
    runtime.resolveGalleryDlArgs?.(settings, url) ?? buildGalleryDlRuntimeArgs(settings)
  const result = await runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [...GALLERY_DL_MAP_ARGS, ...extraArgs, url],
    signal,
    'Snapchat',
    onLine
  )
  if (result.error && RATE_LIMITED.test(result.error)) {
    return {
      complete: false,
      error: 'RateLimited: Snapchat is limiting requests from this network. Retry later.'
    }
  }
  return { complete: result.complete, error: result.error }
}

/**
 * Map one category of a public Snapchat profile. `stories` covers the current
 * 24h story and saved highlights, one item per snap; `spotlight` is one item
 * per post. Only the first page the public web exposes is reachable.
 */
export const mapSnapchatProfile = async (
  owner: string,
  category: SnapchatCategory,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const url = snapchatCategoryUrl(owner, category)
  const release = await runtime.admission?.acquire(url, signal)
  try {
    return await mapSnapchatProfileUnchecked(owner, category, runtime, settings, signal, onItem)
  } finally {
    release?.()
  }
}
