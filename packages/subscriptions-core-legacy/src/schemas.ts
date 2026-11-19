/**
 * Zod schemas mirroring `./types.ts`. The oRPC `subscriptionContract` consumes
 * these directly so all three hosts (desktop / api / cli) agree byte-for-byte
 * on the input/output shapes.
 *
 * Keep these in lockstep with `./types.ts`.
 */
import {
  DownloadTypeSchema,
  OneClickContainerOptionSchema,
  OneClickQualityPresetSchema
} from '@vidbee/downloader-core-legacy/schemas'
import { z } from 'zod'
import { MAX_CHECK_INTERVAL_MS, MIN_CHECK_INTERVAL_MS } from './types.js'

const subscriptionDownloadPreferences = {
  downloadType: DownloadTypeSchema.or(z.literal('subtitles')).optional(),
  downloadQuality: OneClickQualityPresetSchema.optional(),
  downloadContainer: OneClickContainerOptionSchema.optional()
}

export const SubscriptionPlatformSchema = z.enum([
  'youtube',
  'bilibili',
  'custom',
  'instagram',
  'threads',
  'x',
  'tiktok',
  'snapchat'
])
const CheckIntervalSchema = z.number().int().min(MIN_CHECK_INTERVAL_MS).max(MAX_CHECK_INTERVAL_MS)
const CategoriesSchema = z.array(z.string().regex(/^[a-z][a-z-]*$/)).max(16)
export const SubscriptionUpdateInputSchema = z.object({
  ...subscriptionDownloadPreferences,
  title: z.string().optional(),
  sourceUrl: z.string().optional(),
  feedUrl: z.string().optional(),
  platform: SubscriptionPlatformSchema.optional(),
  keywords: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  onlyDownloadLatest: z.boolean().optional(),
  autoDownload: z.boolean().optional(),
  enabled: z.boolean().optional(),
  downloadDirectory: z.string().optional(),
  namingTemplate: z.string().optional(),
  categories: CategoriesSchema.optional(),
  checkIntervalMs: CheckIntervalSchema.nullable().optional()
})

