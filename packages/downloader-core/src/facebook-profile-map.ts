import {
  GALLERY_DL_MAP_ARGS,
  type GalleryDlProfileMapRuntime,
  galleryDlUrlMetadata,
  runGalleryDlJson
} from './gallery-dl-json-run'
import { buildGalleryDlRuntimeArgs } from './instagram-profile'
import { mapPlaylistInfo } from './playlist-plan'
import type { SocialMappedItem } from './social-media-service'
import type { DownloadRuntimeSettings } from './types'
import { buildPlaylistInfoArgs } from './yt-dlp-args'

const PHOTO_ID = /^\d+$/

export type FacebookProfileMapRuntime = GalleryDlProfileMapRuntime

/** Map stable photo/reel links; signed media URLs and cookies never enter the saved profile. */
const mapFacebookProfileUnchecked = async (
  url: string,
  category: 'photos' | 'albums' | 'reels',
  owner: string,
  runtime: FacebookProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  if (category === 'reels') {
    const result = await runGalleryDlJson(
      runtime.resolveYtDlpPath(),
      buildPlaylistInfoArgs(url, settings ?? {}),
      signal,
      'Facebook'
    )
    if (!result.complete) {
      return { complete: false, error: result.error }
    }
    const playlist = mapPlaylistInfo(JSON.parse(result.stdout), url)
    for (const entry of playlist.entries) {
      onItem({
        id: entry.id,
        url: entry.url,
        author: owner,
        title: entry.title,
        images: 0,
        videos: 1
      })
    }
    return { complete: true }
  }
  let mappedCount = 0
  const onLine = (line: string) => {
    const metadata = galleryDlUrlMetadata(line)
    if (!metadata?.id) {
      return
    }
    const id = String(metadata.id)
    if (!PHOTO_ID.test(id)) {
      return
    }
    mappedCount += 1
    onItem({
      id,
      url: `https://www.facebook.com/photo/?fbid=${id}`,
      author: owner,
      images: 1,
      videos: 0
    })
  }
  const extraArgs =
    runtime.resolveGalleryDlArgs?.(settings, url) ?? buildGalleryDlRuntimeArgs(settings)
  const result = await runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [...GALLERY_DL_MAP_ARGS, ...extraArgs, url],
    signal,
    'Facebook',
    onLine
  )
  if (result.complete && mappedCount === 0) {
    return {
      complete: false,
      error: 'No accessible Facebook photos were found. Check profile access and cookie settings.'
    }
  }
  return { complete: result.complete, error: result.error }
}

export const mapFacebookProfile = async (
  url: string,
  category: 'photos' | 'albums' | 'reels',
  owner: string,
  runtime: FacebookProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const release = await runtime.admission?.acquire(url, signal)
  try {
    return await mapFacebookProfileUnchecked(
      url,
      category,
      owner,
      runtime,
      settings,
      signal,
      onItem
    )
  } finally {
    release?.()
  }
}
