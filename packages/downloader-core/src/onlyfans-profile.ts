import { z } from 'zod'

export const OnlyFansCategorySchema = z.enum(['photos', 'videos'])
export const OnlyFansScanSchema = z.enum(['media', 'photos', 'videos', 'posts'])
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

export function onlyFansProfile(
  value: string
): { username: string; profileUrl: string; chatId?: string } | null {
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
    if (
      parts.length === 4 &&
      parts.slice(0, 3).join('/') === 'my/chats/chat' &&
      /^\d{1,20}$/.test(parts[3])
    ) {
      const chatId = parts[3]
      return {
        username: chatId,
        chatId,
        profileUrl: `https://onlyfans.com/my/chats/chat/${chatId}`
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
