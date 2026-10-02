import { fanslyProfile, isFanslySite } from '@vidbee/downloader-core/fansly-profile'
import type { OnlyFansItem } from '@vidbee/downloader-core/onlyfans-profile'
import { type BrowserProfileAdapter, OnlyFansProfiles } from './onlyfans-profile'

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const array = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(object) : []
const id = (value: unknown): string | null =>
  typeof value === 'string' && /^\d+$/.test(value) ? value : null
const api = (url: URL): boolean =>
  url.origin === 'https://apiv3.fansly.com' && url.pathname.startsWith('/api/v1/')

/** Only first-party media locations are accepted; account credentials never go to the CDN. */
export function fanslyMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      /^(?:[a-z0-9-]+\.)*fansly\.com$/.test(url.hostname) &&
      /^(?:cdn|media|video|image)[a-z0-9-]*\./.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null
  } catch {
    return null
  }
}

/** Preserve attachment identity and never substitute a locked item's preview. */
export function fanslyItems(payload: unknown): { item: OnlyFansItem; mediaUrl: string | null }[] {
  const body = object(object(payload).response)
  const aggregate = object(body.aggregationData)
  const posts = [...array(body.posts), ...array(aggregate.posts)]
  const media = [...array(body.accountMedia), ...array(aggregate.accountMedia)]
  const bundles = [...array(body.accountMediaBundles), ...array(aggregate.accountMediaBundles)]
  const postIds = new Map<string, string>()
  const associate = (offerId: string, postId: string, bundleId: unknown = offerId): void => {
    postIds.set(offerId, postId)
    const bundle = bundles.find((entry) => entry.id === bundleId)
    for (const raw of Array.isArray(bundle?.accountMediaIds) ? bundle.accountMediaIds : []) {
      const mediaId = id(raw)
      if (mediaId) {
        postIds.set(mediaId, postId)
      }
    }
    for (const entry of array(bundle?.bundleContent ?? bundle?.content)) {
      const mediaId = id(entry.accountMediaId)
      if (mediaId) {
        postIds.set(mediaId, postId)
      }
    }
  }
  for (const post of posts) {
    const postId = id(post.id)
    if (!postId) {
      continue
    }
    for (const attachment of array(post.attachments)) {
      const contentId = id(attachment.contentId)
      if (contentId) {
        associate(contentId, postId)
      }
    }
  }
  // locationId identifies a timeline; correlationId identifies the actual post.
  for (const location of array(body.data)) {
    const postId = id(location.correlationId)
    const offerId = id(location.mediaOfferId)
    if (postId && offerId) {
      associate(offerId, postId, location.mediaOfferBundleId)
    }
  }
  const result: { item: OnlyFansItem; mediaUrl: string | null }[] = []
  for (const entry of media) {
    const mediaId = id(entry.id)
    const postId = mediaId ? postIds.get(mediaId) : null
    const original = object(entry.media)
    const mimetype = String(original.mimetype ?? '')
    const category = mimetype.startsWith('image/')
      ? 'photos'
      : /video|mpegurl/.test(mimetype)
        ? 'videos'
        : null
    if (!(mediaId && postId && category)) {
      continue
    }
    const variants = [
      original,
      ...array(original.variants).sort((a, b) => Number(b.height || 0) - Number(a.height || 0))
    ]
    const mediaUrl =
      variants
        .filter(
          (variant) =>
            !variant.nsfwBlock &&
            (category === 'photos'
              ? String(variant.mimetype).startsWith('image/')
              : String(variant.mimetype).startsWith('video/'))
        )
        .flatMap((variant) =>
          array(variant.locations).map((location) => fanslyMediaUrl(location.location))
        )
        .find((url) => url && /\.(?:jpe?g|png|webp|gif|mp4|mov|m4v)(?:\?|$)/i.test(url)) ?? null
    result.push({
      item: {
        id: mediaId,
        postId,
        category,
        state:
          entry.access === false
            ? 'locked'
            : mediaUrl
              ? 'available'
              : entry.access === true
                ? 'unsupported'
                : 'locked',
        downloaded: false
      },
      mediaUrl: entry.access === false ? null : mediaUrl
    })
  }
  return result
}

export const fanslyAdapter: BrowserProfileAdapter = {
  name: 'Fansly',
  key: 'fansly',
  origin: 'https://fansly.com',
  normalize: fanslyProfile,
  isSite: isFanslySite,
  items: fanslyItems,
  ownerResponse: (url, username) =>
    api(url) &&
    url.pathname === '/api/v1/account' &&
    (url.searchParams.get('usernames') ?? '').toLowerCase().split(',').includes(username),
  ownerId: (payload, username) =>
    id(
      array(object(payload).response).find(
        (account) => String(account.username).toLowerCase() === username
      )?.id
    ),
  feedResponse: (url, ownerId) =>
    api(url) &&
    (url.pathname === `/api/v1/timeline/${ownerId}` ||
      url.pathname === `/api/v1/timelinenew/${ownerId}` ||
      (url.pathname === '/api/v1/mediaoffers/location' &&
        url.searchParams.get('accountId') === ownerId)),
  complete: (payload) => {
    const body = object(object(payload).response)
    return (
      body.hasMore === false ||
      (Array.isArray(body.posts) && body.posts.length === 0) ||
      (Array.isArray(body.data) && body.data.length === 0)
    )
  },
  postUrl: (item) => `https://fansly.com/post/${item.postId}`,
  postResponse: (url, item) =>
    api(url) &&
    url.pathname === '/api/v1/post' &&
    (url.searchParams.get('ids') ?? '').split(',').includes(item.postId),
  requiresCookies: false
}

export class FanslyProfiles extends OnlyFansProfiles {
  constructor(storageDir: string, defaultDownloadDir: () => string) {
    super(storageDir, defaultDownloadDir, fanslyAdapter)
  }
}
