import { z } from 'zod'

export const SocialMediaOptionsSchema = z
  .object({
    media: z.enum(['all', 'images', 'videos']).default('all'),
    scope: z.enum(['post', 'thread']).default('post'),
    authorOnly: z.boolean().default(false),
    expandThreads: z.boolean().default(false),
    linkedMedia: z.boolean().default(true),
    slideshowAudio: z.boolean().default(false),
    maxPosts: z.number().int().positive().max(1_000_000).optional(),
    since: z.iso.date().optional(),
    until: z.iso.date().optional()
  })
  .refine((value) => !(value.since && value.until) || value.since <= value.until, {
    message: 'The start date must not be after the end date.',
    path: ['since']
  })
export type SocialMediaOptions = z.infer<typeof SocialMediaOptionsSchema>
export const DEFAULT_SOCIAL_MEDIA_OPTIONS: SocialMediaOptions = SocialMediaOptionsSchema.parse({})

export const SocialSourceSchema = z.object({
  platform: z.enum(['x', 'reddit', 'tiktok']),
  url: z.url(),
  kind: z.enum(['post', 'profile', 'feed', 'image', 'unsupported']),
  category: z.string(),
  owner: z.string(),
  supportsThread: z.boolean(),
  requiresAuth: z.boolean(),
  categories: z.array(z.object({ key: z.string(), url: z.url(), requiresAuth: z.boolean() }))
})
export type SocialSource = z.infer<typeof SocialSourceSchema>

const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'mobile.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com'
])
const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'm.reddit.com',
  'np.reddit.com'
])
const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com'
])
const X_USER = /^[A-Za-z0-9_]{1,15}$/
const TIKTOK_USER = /^@[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/
const REDDIT_USER = /^[A-Za-z0-9_-]+$/
const NUMERIC = /^\d+$/
const POST_ID = /^[a-z0-9]+$/i
const X_CATEGORIES = [
  'tweets',
  'media',
  'with_replies',
  'highlights',
  'timeline',
  'likes',
  'following',
  'followers'
]
const REDDIT_CATEGORIES = ['submitted', 'comments', 'saved', 'upvoted', 'downvoted']
const TIKTOK_CATEGORIES = ['posts', 'reposts', 'stories', 'likes', 'saved']
const SORTS = new Set(['hot', 'new', 'top', 'rising', 'controversial', 'best', 'search'])
const X_RESERVED = new Set([
  'home',
  'i',
  'search',
  'hashtag',
  'notifications',
  'settings',
  'explore',
  'messages',
  'login',
  'logout',
  'signup',
  'compose'
])
const REDDIT_QUERY_KEYS = new Set(['q', 'sort', 't', 'restrict_sr', 'type'])

const descriptor = (platform: SocialSource['platform'], url: URL): SocialSource => ({
  platform,
  url: url.toString(),
  kind: 'unsupported',
  category: 'unsupported',
  owner: platform,
  supportsThread: false,
  requiresAuth: false,
  categories: []
})

const profile = (
  source: SocialSource,
  root: string,
  categories: string[],
  selected?: string
): SocialSource => ({
  ...source,
  kind: selected ? 'feed' : 'profile',
  category: selected ?? 'posts',
  categories: categories.map((key) => ({
    key,
    url: `${root}/${key}`,
    requiresAuth: ['likes', 'saved', 'upvoted', 'downvoted', 'following', 'followers'].includes(key)
  }))
})

const resolveX = (url: URL, parts: string[]): SocialSource => {
  const source = descriptor('x', url)
  const [owner = '', second = '', id = '', fourth = ''] = parts
  source.owner = owner
  source.requiresAuth = true
  if (
    (X_USER.test(owner) || owner === 'i') &&
    (second === 'status' || (owner === 'i' && second === 'web' && id === 'status')) &&
    NUMERIC.test(second === 'web' ? fourth : id)
  ) {
    const postId = second === 'web' ? fourth : id
    const tail = parts.slice(second === 'web' ? 4 : 3)
    if (
      tail.length === 0 ||
      (['photo', 'video'].includes(tail[0]) && tail.length === 2 && NUMERIC.test(tail[1]))
    ) {
      return {
        ...source,
        url: `https://x.com/i/web/status/${postId}`,
        kind: 'post',
        category: 'post',
        supportsThread: true,
        requiresAuth: false
      }
    }
    if (tail.length === 1 && tail[0] === 'quotes') {
      return { ...source, kind: 'feed', category: 'quotes' }
    }
    return source
  }
  if (X_USER.test(owner) && second === 'communities' && parts.length === 2) {
    return { ...source, kind: 'feed', category: 'communities' }
  }
  if (
    X_USER.test(owner) &&
    !X_RESERVED.has(owner.toLowerCase()) &&
    (parts.length === 1 || (parts.length === 2 && X_CATEGORIES.includes(second)))
  ) {
    return profile(source, `https://x.com/${owner}`, X_CATEGORIES, second || undefined)
  }
  if (
    (owner === 'home' &&
      (parts.length === 1 || (parts.length === 2 && ['following', 'for-you'].includes(second)))) ||
    (owner === 'notifications' && parts.length === 1)
  ) {
    return {
      ...source,
      kind: 'feed',
      category: owner === 'home' ? `home${second ? `-${second}` : ''}` : owner
    }
  }
  if (
    (owner === 'search' && parts.length === 1 && url.searchParams.get('q')) ||
    (owner === 'hashtag' && parts.length === 2 && second)
  ) {
    return { ...source, kind: 'feed', category: owner }
  }
  if (
    owner === 'i' &&
    ((['bookmarks', 'history', 'timeline', 'communities'].includes(second) && parts.length === 2) ||
      (['lists', 'communities', 'events'].includes(second) &&
        NUMERIC.test(id) &&
        (parts.length === 3 || (second === 'lists' && fourth === 'members' && parts.length === 4))))
  ) {
    return { ...source, kind: 'feed', category: second, owner: id || second }
  }
  return source
}

const resolveReddit = (url: URL, parts: string[]): SocialSource => {
  const source = descriptor('reddit', url)
  const [first = '', name = '', third = '', id = ''] = parts
  if ((first === 'r' || first === 'user' || first === 'u') && third === 's' && parts.length === 4) {
    return { ...source, kind: 'post', category: 'share', owner: name, supportsThread: true }
  }
  const postId = first === 'comments' || first === 'gallery' ? name : third === 'comments' ? id : ''
  if (POST_ID.test(postId)) {
    return {
      ...source,
      url: `https://www.reddit.com/comments/${postId}`,
      kind: 'post',
      category: 'post',
      owner: first === 'r' ? name : 'posts',
      supportsThread: true
    }
  }
  if (
    first === 'r' &&
    /^[A-Za-z0-9_+]+$/.test(name) &&
    (parts.length === 2 || (parts.length === 3 && SORTS.has(third)))
  ) {
    return { ...source, kind: 'feed', category: third || 'hot', owner: name }
  }
  if (
    ['u', 'user'].includes(first) &&
    REDDIT_USER.test(name) &&
    (parts.length === 2 || (parts.length === 3 && REDDIT_CATEGORIES.includes(third)))
  ) {
    const root = `https://www.reddit.com/user/${name}`
    return profile(
      {
        ...source,
        url: `${root}${third ? `/${third}` : ''}${url.search}`,
        owner: name,
        requiresAuth: ['saved', 'upvoted', 'downvoted'].includes(third)
      },
      root,
      REDDIT_CATEGORIES,
      third || undefined
    )
  }
  if (parts.length === 0 || (parts.length === 1 && SORTS.has(first))) {
    return {
      ...source,
      kind: 'feed',
      category: first || 'home',
      owner: 'home',
      requiresAuth: first !== 'search'
    }
  }
  return source
}

const resolveTikTok = (url: URL, parts: string[]): SocialSource => {
  const source = descriptor('tiktok', url)
  const [owner = '', category = '', id = ''] = parts
  if (url.hostname === 'vm.tiktok.com' || url.hostname === 'vt.tiktok.com' || owner === 't') {
    if (
      (parts.length === 1 && /^[\w-]+$/.test(owner)) ||
      (owner === 't' && parts.length === 2 && /^[\w-]+$/.test(category))
    ) {
      return { ...source, kind: 'post', category: 'share' }
    }
    return source
  }
  if (
    (TIKTOK_USER.test(owner) || owner === 'share') &&
    ['photo', 'video'].includes(category) &&
    NUMERIC.test(id) &&
    parts.length === 3
  ) {
    return { ...source, kind: 'post', category, owner: owner.replace(/^@/, '') }
  }
  if (
    TIKTOK_USER.test(owner) &&
    (parts.length === 1 || (parts.length === 2 && TIKTOK_CATEGORIES.includes(category)))
  ) {
    return profile(
      { ...source, owner: owner.slice(1), requiresAuth: ['likes', 'saved'].includes(category) },
      `https://www.tiktok.com/${owner}`,
      TIKTOK_CATEGORIES,
      category || undefined
    )
  }
  if (owner === 'following' && parts.length === 1) {
    return {
      ...source,
      kind: 'feed',
      category: 'following-stories',
      owner: 'following',
      requiresAuth: true
    }
  }
  return source
}

/** Resolve only explicit supported surfaces; platform URLs never silently become videos. */
export const resolveSocialSource = (value: string): SocialSource | null => {
  try {
    const url = new URL(value.trim())
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname.includes('//')
    ) {
      return null
    }
    const host = url.hostname.toLowerCase()
    url.protocol = 'https:'
    url.hash = ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (X_HOSTS.has(host)) {
      url.hostname = 'x.com'
      for (const key of [...url.searchParams.keys()]) {
        if (!['q', 'f', 'src'].includes(key)) {
          url.searchParams.delete(key)
        }
      }
      return resolveX(url, parts)
    }
    if (REDDIT_HOSTS.has(host)) {
      url.hostname = 'www.reddit.com'
      for (const key of [...url.searchParams.keys()]) {
        if (!REDDIT_QUERY_KEYS.has(key)) {
          url.searchParams.delete(key)
        }
      }
      return resolveReddit(url, parts)
    }
    if (host === 'redd.it' && parts.length === 1 && POST_ID.test(parts[0])) {
      return resolveSocialSource(`https://www.reddit.com/comments/${parts[0]}`)
    }
    if (host === 'pbs.twimg.com' && parts[0] === 'media' && parts.length === 2) {
      url.searchParams.set('name', 'orig')
      return { ...descriptor('x', url), kind: 'image', category: 'image', owner: 'images' }
    }
    if (['i.redd.it', 'preview.redd.it'].includes(host) && parts.length === 1) {
      url.hostname = 'i.redd.it'
      url.search = ''
      return { ...descriptor('reddit', url), kind: 'image', category: 'image', owner: 'images' }
    }
    if (TIKTOK_HOSTS.has(host)) {
      if (!['vm.tiktok.com', 'vt.tiktok.com'].includes(host)) {
        url.hostname = 'www.tiktok.com'
      }
      url.search = ''
      if (parts[1] === 'liked') {
        parts[1] = 'likes'
        url.pathname = parts.join('/')
      }
      return resolveTikTok(url, parts)
    }
    return null
  } catch {
    return null
  }
}

export const socialCollectionUrl = (source: SocialSource): string => {
  if (source.kind !== 'profile') {
    return source.url
  }
  return `${source.url.replace(/\/$/, '').split('?')[0]}/${source.platform === 'reddit' ? 'submitted' : source.platform === 'x' ? 'tweets' : 'posts'}`
}

export const SocialMediaPreviewSchema = z.object({
  posts: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  limited: z.boolean()
})
export type SocialMediaPreview = z.infer<typeof SocialMediaPreviewSchema>
