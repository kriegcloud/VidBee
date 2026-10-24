import {
  GALLERY_DL_MAP_ARGS,
  type GalleryDlProfileMapRuntime,
  galleryDlUrlMetadata,
  runGalleryDlJson
} from './gallery-dl-json-run'
import { buildGalleryDlRuntimeArgs } from './instagram-profile'
import { normalizePinterestUrl, PINTEREST_EXTRACTOR_ARGS } from './pinterest'
import type { SocialMappedItem } from './social-media-service'
import type { DownloadRuntimeSettings } from './types'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v'])

/** Save stable pin references, aggregating carousel/story assets per pin. */
export const mapPinterestProfile = async (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const release = await runtime.admission?.acquire(url, signal)
  try {
    const posts = new Map<string, SocialMappedItem>()
    const assets = new Set<string>()
    const onLine = (line: string) => {
      const metadata = galleryDlUrlMetadata(line)
      // Pinterest IDs exceed Number.MAX_SAFE_INTEGER; never round a numeric ID.
      if (typeof metadata?.id !== 'string') {
        return
      }
      const pin = normalizePinterestUrl(`https://www.pinterest.com/pin/${metadata.id}/`)
      const extension = String(metadata.extension).toLowerCase()
      const video = VIDEO_EXTENSIONS.has(extension)
      if (pin?.kind !== 'pin' || !(video || IMAGE_EXTENSIONS.has(extension))) {
        return
      }
      const asset = `${pin.id}:${metadata.num ?? ''}:${metadata.media_id ?? ''}:${metadata.page_id ?? ''}`
      if (assets.has(asset)) {
        return
      }
      assets.add(asset)
      const current = posts.get(pin.id)
      const title = typeof metadata.title === 'string' ? metadata.title.trim() : ''
      const next: SocialMappedItem = {
        id: pin.id,
        url: pin.url,
        author: owner,
        title: title || current?.title,
        images: (current?.images ?? 0) + (video ? 0 : 1),
        videos: (current?.videos ?? 0) + (video ? 1 : 0)
      }
      posts.set(pin.id, next)
      onItem(next)
    }
    const args =
      runtime.resolveGalleryDlArgs?.(settings, url) ?? buildGalleryDlRuntimeArgs(settings)
    const result = await runGalleryDlJson(
      runtime.resolveGalleryDlPath(),
      [...GALLERY_DL_MAP_ARGS, ...PINTEREST_EXTRACTOR_ARGS, ...args, url],
      signal,
      'Pinterest',
      onLine
    )
    if (result.complete && posts.size === 0) {
      return {
        complete: false,
        error:
          'No media pins were found. Check that the Pinterest created feed is public and accessible.'
      }
    }
    return { complete: result.complete, error: result.error }
  } finally {
    release?.()
  }
}
