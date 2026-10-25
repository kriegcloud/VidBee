import { z } from 'zod'

export const OnlyFansCategorySchema = z.enum(['photos', 'videos'])
export const OnlyFansScanSchema = z.enum(['media', 'photos', 'videos', 'posts'])
export const onlyFansChatRoutes = [
  'messages',
  'gallery',
  'opened',
  'purchased',
  'photos',
  'videos'
] as const
export type OnlyFansChatRoute = (typeof onlyFansChatRoutes)[number]
// Every gallery route shares the chat's /media feed; photos and videos are
// split by item category while collecting, not by a server-side filter.
export const onlyFansChatTargets: Record<
  OnlyFansChatRoute,
  { path: string; feed: 'messages' | 'media' }
> = {
  messages: { path: '', feed: 'messages' },
  gallery: { path: '/gallery', feed: 'media' },
  opened: { path: '/gallery/opened', feed: 'media' },
  purchased: { path: '/gallery/purchased', feed: 'media' },
  photos: { path: '/gallery/photos', feed: 'media' },
  videos: { path: '/gallery/videos', feed: 'media' }
}

export function onlyFansChatUrl(chatId: string, route: OnlyFansChatRoute): string {
  return `https://onlyfans.com/my/chats/chat/${chatId}${onlyFansChatTargets[route].path}`
}
export const onlyFansPurchasedRoutes = ['all', 'photos', 'videos', 'posts', 'messages'] as const
export type OnlyFansPurchasedRoute = (typeof onlyFansPurchasedRoutes)[number]
export const onlyFansPurchasedTargets: Record<OnlyFansPurchasedRoute, string> = {
  all: '',
  photos: '?postType=photos',
  videos: '?postType=videos',
  posts: '?entityType=posts',
  messages: '?entityType=messages'
}

export function onlyFansPurchasedUrl(userId: string, route: OnlyFansPurchasedRoute): string {
  return `https://onlyfans.com/my/collections/user-lists/purchased/posts/${userId}${onlyFansPurchasedTargets[route]}`
}
export const OnlyFansItemSchema = z.object({
  id: z.string().regex(/^\d+$/),
  postId: z.string().regex(/^\d+$/),
  category: OnlyFansCategorySchema,
  state: z.enum(['available', 'locked', 'drm', 'unsupported']),
  downloaded: z.boolean().default(false)
})
export const OnlyFansProfileSchema = z.object({
  username: z.string().regex(/^[a-z0-9._-]{1,64}$/),
  profileUrl: z.string().url(),
  chatId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  chatRoute: z.enum(onlyFansChatRoutes).optional(),
  purchasedUserId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  purchasedRoute: z.enum(onlyFansPurchasedRoutes).optional(),
  creatorUsername: z
    .string()
    .regex(/^[a-z0-9._-]{1,64}$/)
    .optional(),
  linkedChatId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  state: z.enum(['idle', 'mapping', 'partial', 'complete', 'auth-required', 'error']),
  category: OnlyFansScanSchema.optional(),
  updatedAt: z.number(),
  pages: z.number(),
  items: z.array(OnlyFansItemSchema),
  error: z.string().optional()
})
export const OnlyFansCommandSchema = z.object({
  url: z.string().url(),
  action: z.enum(['get', 'open', 'map', 'stop']),
  category: OnlyFansScanSchema.default('media')
})
export const OnlyFansDownloadSchema = z.object({
  url: z.string().url(),
  itemIds: z.array(z.string().regex(/^\d+$/)).min(1).max(10_000),
  customDownloadPath: z.string().optional()
})
export type OnlyFansProfile = z.infer<typeof OnlyFansProfileSchema>
export type OnlyFansItem = z.infer<typeof OnlyFansItemSchema>
export type OnlyFansCommand = z.input<typeof OnlyFansCommandSchema>
export type OnlyFansDownload = z.infer<typeof OnlyFansDownloadSchema>

const RESERVED = new Set([
  'my',
  'api',
  'api2',
  'login',
  'signup',
  'notifications',
  'settings',
  'help',
  'terms',
  'privacy',
  'search'
])

export function onlyFansProfile(value: string): {
  username: string
  profileUrl: string
  chatId?: string
  chatRoute?: OnlyFansChatRoute
  purchasedUserId?: string
  purchasedRoute?: OnlyFansPurchasedRoute
} | null {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (
      !(
        ['https:', 'http:'].includes(url.protocol) &&
        ['onlyfans.com', 'www.onlyfans.com'].includes(url.hostname)
      ) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null
    }
    if (parts.slice(0, 3).join('/') === 'my/chats/chat' && /^\d{1,20}$/.test(parts[3] ?? '')) {
      const chatId = parts[3]
      if (parts.length === 4) {
        return { username: chatId, chatId, profileUrl: onlyFansChatUrl(chatId, 'messages') }
      }
      const suffix = `/${parts.slice(4).join('/')}`
      const route = onlyFansChatRoutes.find(
        (candidate) => candidate !== 'messages' && onlyFansChatTargets[candidate].path === suffix
      )
      if (!route) {
        return null
      }
      return {
        username: chatId,
        chatId,
        chatRoute: route,
        profileUrl: onlyFansChatUrl(chatId, route)
      }
    }
    if (
      parts.slice(0, 5).join('/') === 'my/collections/user-lists/purchased/posts' &&
      parts.length === 6 &&
      /^\d{1,20}$/.test(parts[5] ?? '')
    ) {
      const userId = parts[5]
      const filters = url.searchParams
      const route = onlyFansPurchasedRoutes.find(
        (candidate) => onlyFansPurchasedTargets[candidate].slice(1) === filters.toString()
      )
      if (!route) {
        return null
      }
      return {
        username: userId,
        purchasedUserId: userId,
        purchasedRoute: route,
        profileUrl: onlyFansPurchasedUrl(userId, route)
      }
    }
    if (
      parts.length < 1 ||
      parts.length > 2 ||
      (parts.length === 2 && !['media', 'photos', 'videos', 'posts'].includes(parts[1]))
    ) {
      return null
    }
    const username = parts[0].toLowerCase()
    if (!/^[a-z0-9._-]{1,64}$/.test(username) || /^\d+$/.test(username) || RESERVED.has(username)) {
      return null
    }
    return { username, profileUrl: `https://onlyfans.com/${username}` }
  } catch {
    return null
  }
}

export function isOnlyFansSite(value: string): boolean {
  try {
    const host = new URL(value).hostname
    return host === 'onlyfans.com' || host.endsWith('.onlyfans.com')
  } catch {
    return false
  }
}

/** API sessions must stay in the browser that created them. */
export function assertOnlyFansBrowserSession(value: string): void {
  if (isOnlyFansSite(value)) {
    throw new Error(
      'OnlyFans requires the dedicated browser session. Open the OnlyFans profile in VidBee, choose Open browser, sign in there, and map its photos or videos. Imported Chrome cookies are not used for OnlyFans.'
    )
  }
}
