/**
 * Resolve a user-entered URL into a normalized {sourceUrl, feedUrl, platform}.
 *
 * Ported and consolidated from `apps/desktop/src/main/lib/subscription-feed-resolver.ts`.
 * Tests guard regression on the YouTube channel/user/handle and Bilibili shapes
 * that previously fired Sentry issues VIDBEE-39A / VIDBEE-39B.
 */
import { normalizeInstagramProfileUrl } from '@vidbee/downloader-core/instagram-url'
import { normalizeSnapchatUrl } from '@vidbee/downloader-core/snapchat'
import { resolveSocialSource } from '@vidbee/downloader-core/social-media'
import { normalizeThreadsUrl } from '@vidbee/downloader-core/threads'
import {
  type FeedPlatform,
  PROFILE_FEED_URL_PROTOCOL,
  PROFILE_SUBSCRIPTION_CATEGORIES,
  type ProfilePlatform,
  type ResolvedFeed
} from './types'

const ensureUrlHasProtocol = (value: string): string => {
  if (!value) {
    return value
  }
  if (!/^https?:\/\//i.test(value)) {
    return `https://${value}`
  }
  return value
}

const createYouTubeFeedUrl = (key: 'channel_id' | 'user', value: string): string => {
  const feedUrl = new URL('https://www.youtube.com/feeds/videos.xml')
  feedUrl.searchParams.set(key, value)
  return feedUrl.toString()
}

const feed = (sourceUrl: string, feedUrl: string, platform: FeedPlatform): ResolvedFeed => ({
  sourceUrl,
  feedUrl,
  platform,
  sourceKind: 'feed',
  availableCategories: []
})

const profile = (platform: ProfilePlatform, owner: string, sourceUrl: string): ResolvedFeed => ({
  sourceUrl,
  feedUrl: profileFeedUrl(platform, owner),
  platform,
  sourceKind: 'profile',
  profileOwner: owner,
  availableCategories: [...PROFILE_SUBSCRIPTION_CATEGORIES[platform]]
})

/** Synthetic, case-folded feed URL so one account can only be subscribed once. */
export const profileFeedUrl = (platform: ProfilePlatform, owner: string): string =>
  `${PROFILE_FEED_URL_PROTOCOL}//${platform}/${encodeURIComponent(owner.toLowerCase())}`

/**
 * Recognize an account on a platform VidBee maps itself. Any tab, post-less
 * profile alias or category URL of the account resolves to its profile page.
 */
export const resolveProfileSource = (rawUrl: string): ResolvedFeed | null => {
  const normalized = ensureUrlHasProtocol(rawUrl.trim())
  const instagram = normalizeInstagramProfileUrl(normalized)
  if (instagram) {
    return profile('instagram', instagram.username, instagram.profileUrl)
  }
  const threads = normalizeThreadsUrl(normalized)
  if (threads?.kind === 'profile') {
    return profile('threads', threads.username, `https://www.threads.com/@${threads.username}`)
  }
  const snapchat = normalizeSnapchatUrl(normalized)
  if (snapchat && ['profile', 'stories', 'spotlights'].includes(snapchat.kind)) {
    return profile('snapchat', snapchat.username, `https://www.snapchat.com/@${snapchat.username}`)
  }
  const social = resolveSocialSource(normalized)
  if (
    social &&
    (social.platform === 'x' || social.platform === 'tiktok') &&
    social.categories.length > 0
  ) {
    return social.platform === 'x'
      ? profile('x', social.owner, `https://x.com/${social.owner}`)
      : profile('tiktok', social.owner, `https://www.tiktok.com/@${social.owner}`)
  }
  return null
}

export const resolveFeedFromInput = (rawUrl: string): ResolvedFeed => {
  const normalized = ensureUrlHasProtocol(rawUrl.trim())
  const profileSource = resolveProfileSource(normalized)
  if (profileSource) {
    return profileSource
  }

  const youTubeChannelMatch = normalized.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/i)
  if (youTubeChannelMatch?.[1]) {
    return feed(normalized, createYouTubeFeedUrl('channel_id', youTubeChannelMatch[1]), 'youtube')
  }

  if (/youtube\.com\/feeds\/videos\.xml/i.test(normalized)) {
    return feed(normalized, normalized, 'youtube')
  }

  const youTubeUserMatch = normalized.match(/youtube\.com\/(?:user|c)\/([^/?]+)/i)
  if (youTubeUserMatch?.[1]) {
    return feed(normalized, createYouTubeFeedUrl('user', youTubeUserMatch[1]), 'youtube')
  }

  const youTubeHandleMatch = normalized.match(/youtube\.com\/(@[^/?]+)/i)
  if (youTubeHandleMatch?.[1]) {
    const handle = youTubeHandleMatch[1].replace('@', '')
    return feed(normalized, createYouTubeFeedUrl('user', handle), 'youtube')
  }

  const biliSpaceMatch = normalized.match(/bilibili\.com\/(?:space|user)\/(\d+)/i)
  if (biliSpaceMatch?.[1]) {
    return feed(
      normalized,
      `https://rsshub.app/bilibili/user/video/${biliSpaceMatch[1]}`,
      'bilibili'
    )
  }

  if (/rsshub\.app\/bilibili/i.test(normalized)) {
    return feed(normalized, normalized, 'bilibili')
  }

  return feed(normalized, normalized, 'custom')
}

/**
 * Build a stable hash key for duplicate-feed detection. Two feeds compare
 * equal iff their host+path+query collapse to the same string after a few
 * normalization passes (case, trailing slash, missing protocol).
 */
export const buildFeedKey = (feedUrl: string): string => {
  const trimmed = feedUrl.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.startsWith(PROFILE_FEED_URL_PROTOCOL)) {
    return trimmed.toLowerCase()
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(normalized)
    let pathname = url.pathname || '/'
    pathname = pathname.replace(/\/+$/, '')
    if (!pathname) {
      pathname = '/'
    }
    return `${url.host.toLowerCase()}${pathname}${url.search}`
  } catch {
    return trimmed.toLowerCase()
  }
}
