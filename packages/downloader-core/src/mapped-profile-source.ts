import { normalizeFacebookGalleryUrl } from './facebook-gallery'
import { resolveSocialSource } from './social-media'
import { normalizeThreadsUrl } from './threads'
import { normalizeVscoUrl } from './vsco'

export type MappedProfilePlatform = 'x' | 'tiktok' | 'redgifs' | 'facebook' | 'vsco' | 'threads'

export interface MappedProfileSource {
  platform: MappedProfilePlatform
  owner: string
  profileUrl: string
  category: string
  categories: { key: string; url: string; requiresAuth: boolean }[]
}

/** Site name shown wherever a mapped profile is named to the user. */
export const MAPPED_PROFILE_SITE_LABELS: Record<MappedProfilePlatform, string> = {
  x: 'X',
  tiktok: 'TikTok',
  redgifs: 'Redgifs',
  facebook: 'Facebook',
  vsco: 'VSCO',
  threads: 'Threads'
}

const REDGIFS_USER = /^[A-Za-z0-9._-]{1,64}$/
const REDGIFS_POST = /^[A-Za-z0-9-]{2,100}$/

export const redGifsWatchUrl = (id: string): string | null =>
  REDGIFS_POST.test(id) ? `https://www.redgifs.com/watch/${id.toLowerCase()}` : null

export const isMappedProfilePostUrl = (platform: MappedProfilePlatform, value: string): boolean => {
  if (platform === 'vsco') {
    const vsco = normalizeVscoUrl(value)
    return (vsco?.kind === 'media' || vsco?.kind === 'video') && vsco.url === value
  }
  if (platform === 'threads') {
    const threads = normalizeThreadsUrl(value)
    return threads?.kind === 'post' && threads.url === value
  }
  if (platform === 'facebook') {
    try {
      const parsed = new URL(value)
      return (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'www.facebook.com' &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port &&
        !parsed.hash &&
        ((/^\/reel\/\d+\/?$/.test(parsed.pathname) && !parsed.search) ||
          (parsed.pathname === '/photo/' &&
            parsed.searchParams.size === 1 &&
            /^\d+$/.test(parsed.searchParams.get('fbid') ?? '')))
      )
    } catch {
      return false
    }
  }
  if (platform !== 'redgifs') {
    const source = resolveSocialSource(value)
    return source?.platform === platform && source.kind === 'post'
  }
  try {
    const url = new URL(value)
    const match = /^\/watch\/([^/]+)\/?$/.exec(url.pathname)
    return Boolean(
      url.protocol === 'https:' &&
        (url.hostname === 'redgifs.com' || url.hostname === 'www.redgifs.com') &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.search &&
        !url.hash &&
        match?.[1] &&
        redGifsWatchUrl(match[1]) === `https://www.redgifs.com/watch/${match[1]}`
    )
  } catch {
    return false
  }
}

export const resolveMappedProfileSource = (value: string): MappedProfileSource | null => {
  const vsco = normalizeVscoUrl(value)
  if (vsco?.kind === 'gallery') {
    return {
      platform: 'vsco',
      owner: vsco.username,
      profileUrl: vsco.url,
      category: 'gallery',
      categories: [{ key: 'gallery', url: vsco.url, requiresAuth: false }]
    }
  }
  const threads = normalizeThreadsUrl(value)
  if (threads?.kind === 'profile') {
    return {
      platform: 'threads',
      owner: threads.username,
      profileUrl: threads.url,
      category: 'media',
      categories: [{ key: 'media', url: threads.url, requiresAuth: true }]
    }
  }
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase()
    if (
      ['http:', 'https:'].includes(parsed.protocol) &&
      [
        'facebook.com',
        'www.facebook.com',
        'm.facebook.com',
        'mbasic.facebook.com',
        'web.facebook.com'
      ].includes(host) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
    ) {
      const gallery = normalizeFacebookGalleryUrl(value)
      const reels = /^\/([A-Za-z0-9][A-Za-z0-9.]*)\/reels\/?$/.exec(parsed.pathname)
      const reelOwner =
        reels && normalizeFacebookGalleryUrl(`https://www.facebook.com/${reels[1]}`)
          ? reels[1]
          : null
      const owner =
        gallery?.directorySegments.length === 3 ? gallery.directorySegments[1] : reelOwner
      if (owner) {
        const profileUrl = `https://www.facebook.com/${owner}`
        return {
          platform: 'facebook',
          owner,
          profileUrl,
          category: reelOwner
            ? 'reels'
            : gallery?.url.endsWith('/photos_albums')
              ? 'albums'
              : 'photos',
          categories: [
            { key: 'photos', url: `${profileUrl}/photos`, requiresAuth: true },
            { key: 'albums', url: `${profileUrl}/photos_albums`, requiresAuth: true },
            { key: 'reels', url: `${profileUrl}/reels`, requiresAuth: true }
          ]
        }
      }
    }
  } catch {
    return null
  }
  const social = resolveSocialSource(value)
  if (social?.categories.length && (social.platform === 'x' || social.platform === 'tiktok')) {
    return {
      platform: social.platform,
      owner: social.owner,
      profileUrl:
        social.platform === 'x'
          ? `https://x.com/${social.owner}`
          : `https://www.tiktok.com/@${social.owner}`,
      category: social.category,
      categories: social.categories
    }
  }
  try {
    const url = new URL(value)
    if (
      !(
        ['http:', 'https:'].includes(url.protocol) &&
        ['redgifs.com', 'www.redgifs.com'].includes(url.hostname.toLowerCase())
      ) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null
    }
    const match = /^\/users\/([^/]+)\/?$/.exec(url.pathname)
    const owner = match?.[1]
    if (!(owner && REDGIFS_USER.test(owner))) {
      return null
    }
    const profileUrl = `https://www.redgifs.com/users/${owner}`
    return {
      platform: 'redgifs',
      owner,
      profileUrl,
      category: 'posts',
      categories: [{ key: 'posts', url: profileUrl, requiresAuth: false }]
    }
  } catch {
    return null
  }
}
