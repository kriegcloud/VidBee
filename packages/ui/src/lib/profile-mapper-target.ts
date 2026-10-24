import { fanslyProfile } from '@vidbee/downloader-core/fansly-profile'
import { resolveMappedProfileSource } from '@vidbee/downloader-core/mapped-profile-source'
import { onlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'
import { resolveSocialSource } from '@vidbee/downloader-core/social-media'
import { normalizeThreadsUrl } from '@vidbee/downloader-core/threads'
import { normalizeVscoUrl } from '@vidbee/downloader-core/vsco'
import { resolveDownloadPlatform } from './download-platform'

export interface ProfileMapperTarget {
  /** Profile URL to hand to the mapper. */
  profileUrl: string
  /** Site name shown in the menu, e.g. `TikTok`. */
  siteLabel: string
}

/** Profile URL for a post, by platform. Redgifs and Facebook posts do not name their owner. */
const socialProfileUrl = (platform: string, owner: string): string | null => {
  if (platform === 'x') {
    return `https://x.com/${owner}`
  }
  if (platform === 'tiktok') {
    return `https://www.tiktok.com/@${owner}`
  }
  if (platform === 'instagram') {
    return `https://www.instagram.com/${owner}/`
  }
  return null
}

/** OnlyFans and Fansly post permalinks are `/<postId>/<username>`. */
const creatorProfileUrl = (sourceUrl: string): string | undefined => {
  try {
    const source = new URL(sourceUrl)
    const parts = source.pathname.split('/').filter(Boolean)
    if (/^\d+$/.test(parts[0] ?? '') && parts.length === 2) {
      source.pathname = `/${parts[1]}`
    }
    return onlyFansProfile(source.href)?.profileUrl ?? fanslyProfile(source.href)?.profileUrl
  } catch {
    return undefined
  }
}

/**
 * The profile a download came from, so any row can open its mapper.
 * Accepts a post permalink or a profile URL; returns null when the URL
 * cannot name an owner (a Redgifs watch link, a Facebook reel).
 */
export const resolveProfileMapperTarget = (sourceUrl?: string): ProfileMapperTarget | null => {
  if (!sourceUrl) {
    return null
  }
  const label = (url: string): string => resolveDownloadPlatform(url).label
  // VSCO and Threads posts name their owner in the path, so a post row resolves
  // to the gallery or media tab its mapper traverses.
  const vsco = normalizeVscoUrl(sourceUrl)
  if (vsco) {
    const profileUrl = `https://vsco.co/${vsco.username}/gallery`
    return { profileUrl, siteLabel: label(profileUrl) }
  }
  const threads = normalizeThreadsUrl(sourceUrl)
  if (threads) {
    const profileUrl = `https://www.threads.com/@${threads.username}/media`
    return { profileUrl, siteLabel: label(profileUrl) }
  }
  const creator = creatorProfileUrl(sourceUrl)
  if (creator) {
    return { profileUrl: creator, siteLabel: label(creator) }
  }
  const social = resolveSocialSource(sourceUrl)
  if (social?.owner) {
    const candidate = socialProfileUrl(social.platform, social.owner)
    // Instagram has its own inspector, so it needs no mapped-profile entry.
    if (candidate && (social.platform === 'instagram' || resolveMappedProfileSource(candidate))) {
      return { profileUrl: candidate, siteLabel: label(candidate) }
    }
  }
  const mapped = resolveMappedProfileSource(sourceUrl)
  if (mapped) {
    return { profileUrl: mapped.profileUrl, siteLabel: label(mapped.profileUrl) }
  }
  return null
}
