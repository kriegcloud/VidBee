import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  GALLERY_DL_MAP_ARGS,
  type GalleryDlProfileMapRuntime,
  galleryDlUrlMetadata,
  runGalleryDlJson
} from './gallery-dl-json-run'
import { buildGalleryDlRuntimeArgs } from './instagram-profile'
import {
  type ProfileMapOptions,
  type SocialMappedItem,
  writeKnownItemsFile
} from './social-media-service'
import { normalizeThreadsUrl } from './threads'
import type { DownloadRuntimeSettings } from './types'

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm'])
const AUTH_FAILURE =
  /AuthRequired|Threads session|login required|authenticated cookies|Extracted 0 cookies|not logged in/i

/**
 * The Threads media tab yields one `Message.Url` per asset, so a carousel post
 * arrives as several events sharing one id. Counts are accumulated per post and
 * the item is re-emitted, which keeps a partial map honest if the run is
 * stopped midway through a carousel.
 */
const mapThreadsProfileUnchecked = async (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void,
  knownItemsFile: string | undefined
): Promise<{ complete: boolean; error?: string }> => {
  const posts = new Map<string, SocialMappedItem>()
  const onLine = (line: string) => {
    const metadata = galleryDlUrlMetadata(line)
    if (!metadata) {
      return
    }
    const id = metadata.id
    const shortcode = metadata.shortcode
    if (typeof id !== 'string' || typeof shortcode !== 'string') {
      return
    }
    const post = normalizeThreadsUrl(`https://www.threads.com/@${owner}/post/${shortcode}`)
    if (post?.kind !== 'post') {
      return
    }
    const video = VIDEO_EXTENSIONS.has(String(metadata.extension).toLowerCase())
    const current = posts.get(id) ?? {
      id,
      url: post.url,
      author: owner,
      images: 0,
      videos: 0
    }
    const next: SocialMappedItem = {
      ...current,
      images: current.images + (video ? 0 : 1),
      videos: current.videos + (video ? 1 : 0)
    }
    if (typeof metadata.taken_at === 'number' && metadata.taken_at > 0) {
      next.publishedAt = metadata.taken_at * 1000
    }
    posts.set(id, next)
    onItem(next)
  }
  const extraArgs =
    runtime.resolveGalleryDlArgs?.(settings, url) ?? buildGalleryDlRuntimeArgs(settings)
  const result = await runGalleryDlJson(
    runtime.resolveGalleryDlPath(),
    [
      ...GALLERY_DL_MAP_ARGS,
      ...extraArgs,
      ...(knownItemsFile
        ? ['-o', `extractor.threads.known-items-file=${JSON.stringify(knownItemsFile)}`]
        : []),
      url
    ],
    signal,
    'Threads',
    onLine
  )
  if (result.error && AUTH_FAILURE.test(result.error)) {
    return {
      complete: false,
      error:
        'AuthRequired: sign in to Threads in the browser set for cookies in Settings, then retry mapping.'
    }
  }
  if (result.complete && posts.size === 0) {
    return {
      complete: false,
      error: 'No posts were found on this Threads media tab. Check profile access and cookies.'
    }
  }
  return { complete: result.complete, error: result.error }
}

export const mapThreadsProfile = async (
  url: string,
  owner: string,
  runtime: GalleryDlProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void,
  options: ProfileMapOptions = {}
): Promise<{ complete: boolean; error?: string }> => {
  const release = await runtime.admission?.acquire(url, signal)
  const directory = options.knownIds?.length
    ? await mkdtemp(path.join(tmpdir(), 'vidbee-threads-map-'))
    : undefined
  try {
    const knownItemsFile = directory
      ? await writeKnownItemsFile(directory, options.knownIds)
      : undefined
    return await mapThreadsProfileUnchecked(
      url,
      owner,
      runtime,
      settings,
      signal,
      onItem,
      knownItemsFile
    )
  } finally {
    release?.()
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
