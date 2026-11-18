import { z } from "zod";
export { DEFAULT_SOCIAL_MEDIA_OPTIONS, resolveSocialSource, socialCollectionUrl, readSocialAsset, selectPrimarySocialFile, socialManifestPostKeyPrefix } from "@vidbee/downloader-core/social-media";
export type { SocialAssetFile, SocialSource, SocialMediaPreview } from "@vidbee/downloader-core/social-media";
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
export type SocialMediaOptions = z.infer<typeof SocialMediaOptionsSchema>;
