import { z } from "zod";
import { onlyFansChatRoutes, onlyFansPurchasedRoutes, isOnlyFansSite } from "@vidbee/downloader-core/onlyfans-profile";
export { onlyFansChatRoutes, onlyFansChatTargets, onlyFansChatUrl, onlyFansPurchasedRoutes, onlyFansPurchasedTargets, onlyFansPurchasedUrl, onlyFansProfile, isOnlyFansSite } from "@vidbee/downloader-core/onlyfans-profile";
export type { OnlyFansChatRoute, OnlyFansPurchasedRoute } from "@vidbee/downloader-core/onlyfans-profile";
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

export function assertOnlyFansBrowserSession(value: string): void {
  if (isOnlyFansSite(value)) {
    throw new Error(
      'OnlyFans requires the dedicated browser session. Open the OnlyFans profile in VidBeep, choose Open browser, sign in there, and map its photos or videos. Imported Chrome cookies are not used for OnlyFans.'
    )
  }
}
