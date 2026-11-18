import { z } from 'zod';
export declare const SocialMediaOptionsSchema: z.ZodObject<{
    media: z.ZodDefault<z.ZodEnum<{
        all: "all";
        images: "images";
        videos: "videos";
    }>>;
    scope: z.ZodDefault<z.ZodEnum<{
        post: "post";
        thread: "thread";
    }>>;
    authorOnly: z.ZodDefault<z.ZodBoolean>;
    expandThreads: z.ZodDefault<z.ZodBoolean>;
    linkedMedia: z.ZodDefault<z.ZodBoolean>;
    slideshowAudio: z.ZodDefault<z.ZodBoolean>;
    maxPosts: z.ZodOptional<z.ZodNumber>;
    since: z.ZodOptional<z.ZodISODate>;
    until: z.ZodOptional<z.ZodISODate>;
}, z.core.$strip>;
export type SocialMediaOptions = z.infer<typeof SocialMediaOptionsSchema>;
export declare const DEFAULT_SOCIAL_MEDIA_OPTIONS: SocialMediaOptions;
export declare const SocialSourceSchema: z.ZodObject<{
    platform: z.ZodEnum<{
        instagram: "instagram";
        reddit: "reddit";
        tiktok: "tiktok";
        x: "x";
    }>;
    url: z.ZodURL;
    kind: z.ZodEnum<{
        feed: "feed";
        image: "image";
        post: "post";
        profile: "profile";
        unsupported: "unsupported";
    }>;
    category: z.ZodString;
    owner: z.ZodString;
    supportsThread: z.ZodBoolean;
    requiresAuth: z.ZodBoolean;
    categories: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        url: z.ZodURL;
        requiresAuth: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SocialSource = z.infer<typeof SocialSourceSchema>;
/** Resolve only explicit supported surfaces; platform URLs never silently become videos. */
export declare const resolveSocialSource: (value: string) => SocialSource | null;
export declare const socialCollectionUrl: (source: SocialSource) => string;
export declare const SocialMediaPreviewSchema: z.ZodObject<{
    posts: z.ZodNumber;
    images: z.ZodNumber;
    videos: z.ZodNumber;
    limited: z.ZodBoolean;
}, z.core.$strip>;
export type SocialMediaPreview = z.infer<typeof SocialMediaPreviewSchema>;
/** One file a social collection run saved or verified on disk. */
export interface SocialAssetFile {
    readonly path: string;
    readonly kind: 'image' | 'video' | 'audio';
}
/** Narrow one `asset` protocol event from the social extractor; anything else is ignored. */
export declare const readSocialAsset: (event: unknown) => SocialAssetFile | null;
/**
 * Pick the file a details page should open for a social run: the first video,
 * else the first audio track, else the first image. `null` when nothing was saved.
 */
export declare const selectPrimarySocialFile: (assets: readonly SocialAssetFile[]) => string | null;
/**
 * Manifest asset-key prefix (`<category>:<postId>:`) for a single-post source,
 * used to find media saved by runs that predate per-asset reporting.
 * `null` for profiles, feeds and platforms whose post id is not in the URL.
 */
export declare const socialManifestPostKeyPrefix: (url: string) => string | null;
