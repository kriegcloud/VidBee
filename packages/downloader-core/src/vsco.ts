const VSCO_HOSTS = new Set(['vsco.co', 'www.vsco.co'])
const VSCO_USER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const VSCO_GALLERY_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)(?:\/(?:gallery|images))?\/?$/i
const VSCO_MEDIA_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)\/media\/([0-9a-f]+)\/?$/i
const VSCO_VIDEO_PATH = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)\/video\/([A-Za-z0-9-]+)\/?$/i

/**
 * Site routes that look like a username. `/spaces/<id>` and `/<user>/spaces`
 * are separate gallery-dl extractors, so neither is a profile gallery here.
 */
const VSCO_RESERVED = new Set([
  'about',
  'discover',
  'feed',
  'login',
  'signup',
  'search',
  'spaces',
  'store',
  'user'
])

export interface NormalizedVscoUrl {
  /** `gallery` is the whole profile; `media` and `video` are single posts. */
  kind: 'gallery' | 'media' | 'video'
  username: string
  /** Canonical URL to hand gallery-dl. */
  url: string
  /** Post id, empty for a gallery. */
  id: string
  directorySegments: readonly string[]
}

/** Normalize the VSCO profile and post routes gallery-dl can extract. */
export const normalizeVscoUrl = (value: string): NormalizedVscoUrl | null => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (
    !(
      ['http:', 'https:'].includes(parsed.protocol) && VSCO_HOSTS.has(parsed.hostname.toLowerCase())
    )
  ) {
    return null
  }
  const media = VSCO_MEDIA_PATH.exec(parsed.pathname)
  if (media) {
    const [, username, id] = media
    return {
      kind: 'media',
      username,
      url: `https://vsco.co/${username}/media/${id.toLowerCase()}`,
      id: id.toLowerCase(),
      directorySegments: ['VSCO', username, 'Gallery']
    }
  }
  const video = VSCO_VIDEO_PATH.exec(parsed.pathname)
  if (video) {
    const [, username, id] = video
    return {
      kind: 'video',
      username,
      url: `https://vsco.co/${username}/video/${id}`,
      id,
      directorySegments: ['VSCO', username, 'Gallery']
    }
  }
  const gallery = VSCO_GALLERY_PATH.exec(parsed.pathname)
  const username = gallery?.[1]
  if (!username || VSCO_RESERVED.has(username.toLowerCase())) {
    return null
  }
  return {
    kind: 'gallery',
    username,
    url: `https://vsco.co/${username}/gallery`,
    id: '',
    directorySegments: ['VSCO', username, 'Gallery']
  }
}

/** A single VSCO post, which the profile mapper enumerates and queues one by one. */
export const vscoPostUrl = (username: string, id: string, video: boolean): string | null => {
  if (!(VSCO_USER.test(username) && (video ? /^[A-Za-z0-9-]+$/ : /^[0-9a-f]+$/i).test(id))) {
    return null
  }
  return video
    ? `https://vsco.co/${username}/video/${id}`
    : `https://vsco.co/${username}/media/${id.toLowerCase()}`
}
