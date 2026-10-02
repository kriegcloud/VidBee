import { resolveSocialSource } from './social-media'

export type MappedProfilePlatform = 'x' | 'tiktok' | 'redgifs'

export interface MappedProfileSource {
  platform: MappedProfilePlatform
  owner: string
  profileUrl: string
  category: string
  categories: { key: string; url: string; requiresAuth: boolean }[]
}

const REDGIFS_USER = /^[A-Za-z0-9._-]{1,64}$/
const REDGIFS_POST = /^[A-Za-z0-9-]{2,100}$/

export const redGifsWatchUrl = (id: string): string | null =>
  REDGIFS_POST.test(id) ? `https://www.redgifs.com/watch/${id.toLowerCase()}` : null

export const isMappedProfilePostUrl = (platform: MappedProfilePlatform, value: string): boolean => {
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
