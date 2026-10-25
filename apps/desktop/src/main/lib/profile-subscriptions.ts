/**
 * Desktop side of profile subscriptions: checks an account through the same
 * mappers the profile dialogs use (so saved profiles and subscriptions share
 * one map) and queues new items with the task kind each platform downloads
 * through.
 */
import { randomUUID } from 'node:crypto'
import type { DownloadRuntimeSettings, InstagramProfileCategory } from '@vidbee/downloader-core'
import { resolveDownloadTaskKind } from '@vidbee/downloader-core/gallery-dl-executor'
import {
  enqueueInstagramProfileDownload,
  type InstagramProfileInspector,
  instagramInspectionId
} from '@vidbee/downloader-core/instagram-profile'
import { normalizeInstagramProfileUrl } from '@vidbee/downloader-core/instagram-url'
import {
  isMappedProfilePostUrl,
  type MappedProfilePlatform
} from '@vidbee/downloader-core/mapped-profile-source'
import { downloadSocialMedia } from '@vidbee/downloader-core/social-media-service'
import type { SocialProfileManager } from '@vidbee/downloader-core/social-profile-manager'
import type { EnqueueItemContext } from '@vidbee/subscriptions-core/api'
import type {
  ProfileCategoryError,
  ProfileCheckResult,
  ProfileFeedItem,
  ProfileSourceFetcher,
  SubscriptionRule
} from '@vidbee/subscriptions-core/types'
import { profileItemCategory } from '@vidbee/subscriptions-core/types'
import type { TaskQueueAPI } from '@vidbee/task-queue'

/** Matches the Instagram inspector's own throttle cooldown. */
const RATE_LIMIT_RETRY_MS = 15 * 60 * 1000
const SUBSCRIPTION_PRIORITY = 10

/** Subscription category → the mapper's category key, where they differ. */
const MAPPER_CATEGORY: Record<string, Record<string, string>> = {
  x: { 'posts-with-media': 'tweets' }
}

export const mapperCategory = (platform: string, category: string): string =>
  MAPPER_CATEGORY[platform]?.[category] ?? category

/** Classify a mapper's saved error text; mappers prefix the two retryable cases. */
export const classifyMapError = (error: string | undefined): ProfileCategoryError =>
  error?.startsWith('RateLimited')
    ? 'rate-limited'
    : error?.includes('AuthRequired')
      ? 'auth-required'
      : 'error'

const INSTAGRAM_ERROR: Partial<Record<string, ProfileCategoryError>> = {
  'rate-limited': 'rate-limited',
  'auth-required': 'auth-required'
}

const CATEGORY_TITLES: Record<string, string> = {
  stories: 'Story',
  highlights: 'Highlight',
  posts: 'Post',
  reels: 'Reel',
  tagged: 'Tagged post',
  media: 'Media',
  'posts-with-media': 'Post',
  spotlight: 'Spotlight'
}

export interface DesktopProfileSubscriptionDeps {
  socialProfiles: () => SocialProfileManager
  instagram: () => InstagramProfileInspector
  queue: () => TaskQueueAPI
  settings: () => DownloadRuntimeSettings
  defaultDownloadDir: () => string
  now?: () => number
}

const itemTitle = (owner: string, category: string, title?: string): string =>
  title?.trim() || `@${owner} · ${CATEGORY_TITLES[category] ?? category}`

const checkInstagram = async (
  deps: DesktopProfileSubscriptionDeps,
  subscription: SubscriptionRule
): Promise<ProfileCheckResult> => {
  const categories = subscription.categories as InstagramProfileCategory[]
  const inspection = await deps
    .instagram()
    .inspect(subscription.sourceUrl, deps.settings(), categories)
  const result: ProfileCheckResult = {
    title: inspection.profile.displayName ?? `@${inspection.profile.username}`,
    avatarUrl: inspection.profile.avatarUrl,
    items: [],
    categoryErrors: {}
  }
  for (const summary of inspection.categories) {
    if (!categories.includes(summary.category)) {
      continue
    }
    if (summary.errorCode) {
      result.categoryErrors[summary.category] = INSTAGRAM_ERROR[summary.errorCode] ?? 'error'
      result.error ??= `Instagram ${summary.category}: ${summary.errorCode}`
      if (summary.retryAfter) {
        result.retryAfter = Math.max(result.retryAfter ?? 0, summary.retryAfter)
      }
    }
    for (const item of summary.items ?? []) {
      // A highlight keeps its URL while gaining snaps; its version names the content.
      const version =
        summary.category === 'highlights' ? (item.sourceVersion ?? String(item.assetCount)) : ''
      result.items.push({
        id: version ? `${item.url}#${version}` : item.url,
        category: summary.category,
        url: item.url,
        title: itemTitle(inspection.profile.username, summary.category, item.title),
        versioned: Boolean(version)
      })
    }
  }
  return result
}

/** X, TikTok, Threads and Snapchat map through the shared social profile manager. */
const checkSocial = async (
  deps: DesktopProfileSubscriptionDeps,
  subscription: SubscriptionRule,
  signal: AbortSignal
): Promise<ProfileCheckResult> => {
  const now = deps.now ?? Date.now
  const manager = deps.socialProfiles()
  const owner = subscription.profileOwner ?? subscription.title
  // The mappers expose no display name; the handle replaces the URL placeholder title.
  const result: ProfileCheckResult = { title: `@${owner}`, items: [], categoryErrors: {} }
  for (const category of subscription.categories) {
    if (signal.aborted) {
      break
    }
    const key = mapperCategory(subscription.platform, category)
    const profile = await manager.mapAndWait(subscription.sourceUrl, key, deps.settings(), {
      incremental: true,
      signal
    })
    const mapped = profile.categories[key]
    if (!mapped) {
      result.categoryErrors[category] = 'error'
      continue
    }
    if (mapped.state !== 'complete') {
      const error = classifyMapError(mapped.error)
      result.categoryErrors[category] = error
      result.error ??= mapped.error ?? `${category} mapping did not finish`
      if (error === 'rate-limited') {
        result.retryAfter = now() + RATE_LIMIT_RETRY_MS
      }
    }
    // Items saved by this and earlier maps; partial maps still contribute.
    for (const item of mapped.items) {
      const entry: ProfileFeedItem = {
        id: item.id,
        category,
        url: item.url,
        title: itemTitle(owner, category, item.title)
      }
      if (item.publishedAt !== undefined) {
        entry.publishedAt = item.publishedAt
      }
      result.items.push(entry)
    }
  }
  return result
}

/** Checks profile subscriptions through the desktop mappers. */
export const createDesktopProfileFetcher = (
  deps: DesktopProfileSubscriptionDeps
): ProfileSourceFetcher => ({
  fetch: (subscription, signal) =>
    subscription.platform === 'instagram'
      ? checkInstagram(deps, subscription)
      : checkSocial(deps, subscription, signal)
})

/**
 * Queue one new profile item. Instagram and X/TikTok keep their own queue
 * groups (one task at a time per site, which is what keeps them under the
 * rate limits); Threads and Snapchat posts queue under the subscription.
 */
export const enqueueProfileSubscriptionItem = async (
  deps: DesktopProfileSubscriptionDeps,
  { subscription, item, trigger, batch }: EnqueueItemContext
): Promise<string | null> => {
  const queue = deps.queue()
  const settings = deps.settings()
  const destination = subscription.downloadDirectory?.trim() || deps.defaultDownloadDir()
  const category = profileItemCategory(subscription.platform, item.id)
  const batchInfo = batch ?? {
    id: `subscription_${subscription.id}_${randomUUID()}`,
    title: subscription.title
  }

  if (subscription.platform === 'instagram') {
    const username = normalizeInstagramProfileUrl(subscription.sourceUrl)?.username
    if (!(username && category)) {
      return null
    }
    const inspectionId = instagramInspectionId(username)
    const summary = deps
      .instagram()
      .get(inspectionId)
      ?.inspection.categories.find((entry) => entry.category === category)
    const reference = summary?.items?.find((entry) => entry.url === item.url)
    if (!reference) {
      return null
    }
    const result = await enqueueInstagramProfileDownload({
      queue,
      inspector: deps.instagram(),
      input: {
        inspectionId,
        itemIds: [reference.id],
        categories: [category as InstagramProfileCategory],
        customDownloadPath: destination,
        settings
      },
      defaultDownloadDir: deps.defaultDownloadDir(),
      batch: batchInfo,
      priority: SUBSCRIPTION_PRIORITY
    })
    return result.tasks[0]?.downloadId ?? null
  }

  const platform = subscription.platform as MappedProfilePlatform
  if (!isMappedProfilePostUrl(platform, item.url)) {
    return null
  }

  if (platform === 'x' || platform === 'tiktok') {
    const result = await downloadSocialMedia(
      queue,
      { url: item.url, customDownloadPath: destination, settings },
      { id: batchInfo.id, title: batchInfo.title, order: 0 }
    )
    return result.ids[0] ?? null
  }

  // One post at a time per subscription keeps Threads and Snapchat polite.
  await queue.setMaxPerGroup(subscription.id, 1)
  const id = randomUUID()
  const result = await queue.add({
    id,
    input: {
      url: item.url,
      kind: resolveDownloadTaskKind(item.url, 'video'),
      subscriptionId: subscription.id,
      title: item.title,
      ...(item.thumbnail ? { thumbnail: item.thumbnail } : {}),
      options: {
        type: 'video',
        customDownloadPath: destination,
        downloadPath: destination,
        settings,
        origin: trigger === 'auto' ? 'subscription' : 'manual',
        tags: Array.from(new Set([subscription.platform, ...subscription.tags])),
        subscriptionId: subscription.id,
        itemId: item.id,
        batchId: batchInfo.id,
        batchKind: 'social-media',
        batchTitle: batchInfo.title,
        batchCategory: category
      }
    },
    priority: SUBSCRIPTION_PRIORITY,
    groupKey: subscription.id
  })
  return result.id
}
