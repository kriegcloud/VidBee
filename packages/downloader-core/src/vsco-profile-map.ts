import {
  GALLERY_DL_MAP_ARGS,
  type GalleryDlProfileMapRuntime,
  galleryDlUrlMetadata,
  runGalleryDlJson
} from './gallery-dl-json-run'
import { buildGalleryDlRuntimeArgs } from './instagram-profile'
import type { SocialMappedItem } from './social-media-service'
import type { DownloadRuntimeSettings } from './types'
import { vscoPostUrl } from './vsco'

/**
 * VSCO's gallery extractor yields one `Message.Url` per post with the post's
 * own `_id` as `id`, so a traversal of `/<user>/gallery` names every post
 * without downloading a byte. Each mapped item is the post's own page, which
 * the image and video extractors can fetch on its own later.
 */
const mapVscoProfileUnchecked = async (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  let mappedCount = 0
  const onLine = (line: string) => {
    const metadata = galleryDlUrlMetadata(line)
    if (!metadata?.id) {
      return
    }
    const id = String(metadata.id)
    const video = metadata.video === true
    const postUrl = vscoPostUrl(owner, id, video)
    if (!postUrl) {
      return
    }
    const description = typeof metadata.description === 'string' ? metadata.description.trim() : ''
    mappedCount += 1
    onItem({
      id,
      url: postUrl,
      author: owner,
      title: description || undefined,
      images: video ? 0 : 1,
      videos: video ? 1 : 0
    })
  }
  const extraArgs =
    runtime.resolveGalleryDlArgs?.(settings, url) ?? buildGalleryDlRuntimeArgs(settings)
  const result = await runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [
      ...GALLERY_DL_MAP_ARGS,
      '-o',
      'extractor.vsco.tls12=true',
      '-o',
      'extractor.vsco.videos=true',
      ...extraArgs,
      url
    ],
    signal,
    'VSCO',
    onLine
  )
  if (result.complete && mappedCount === 0) {
    return {
      complete: false,
      error:
        'VSCO returned no posts for this session. If the gallery is visible in your browser, connect or refresh your VSCO session in VidBee, or import fresh VSCO cookies, then map again.'
    }
  }
  return { complete: result.complete, error: result.error }
}

export const mapVscoProfile = async (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const release = await runtime.admission?.acquire(url, signal)
  try {
    return await mapVscoProfileUnchecked(url, owner, runtime, settings, signal, onItem)
  } finally {
    release?.()
  }
}
