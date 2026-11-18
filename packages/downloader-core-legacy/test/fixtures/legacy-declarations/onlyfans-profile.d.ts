import { z } from 'zod';
export declare const OnlyFansCategorySchema: z.ZodEnum<{
    photos: "photos";
    videos: "videos";
}>;
export declare const OnlyFansScanSchema: z.ZodEnum<{
    media: "media";
    photos: "photos";
    posts: "posts";
    videos: "videos";
}>;
export declare const onlyFansChatRoutes: readonly ['messages', 'gallery', 'opened', 'purchased', 'photos', 'videos'];
export type OnlyFansChatRoute = (typeof onlyFansChatRoutes)[number];
export declare const onlyFansChatTargets: Record<OnlyFansChatRoute, {
    path: string;
    feed: 'messages' | 'media';
}>;
export declare function onlyFansChatUrl(chatId: string, route: OnlyFansChatRoute): string;
export declare const onlyFansPurchasedRoutes: readonly ['all', 'photos', 'videos', 'posts', 'messages'];
export type OnlyFansPurchasedRoute = (typeof onlyFansPurchasedRoutes)[number];
export declare const onlyFansPurchasedTargets: Record<OnlyFansPurchasedRoute, string>;
export declare function onlyFansPurchasedUrl(userId: string, route: OnlyFansPurchasedRoute): string;
export declare const OnlyFansItemSchema: z.ZodObject<{
    id: z.ZodString;
    postId: z.ZodString;
    category: z.ZodEnum<{
        photos: "photos";
        videos: "videos";
    }>;
    state: z.ZodEnum<{
        available: "available";
        drm: "drm";
        locked: "locked";
        unsupported: "unsupported";
    }>;
    downloaded: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const OnlyFansProfileSchema: z.ZodObject<{
    username: z.ZodString;
    profileUrl: z.ZodString;
    chatId: z.ZodOptional<z.ZodString>;
    chatRoute: z.ZodOptional<z.ZodEnum<{
        gallery: "gallery";
        messages: "messages";
        opened: "opened";
        photos: "photos";
        purchased: "purchased";
        videos: "videos";
    }>>;
    purchasedUserId: z.ZodOptional<z.ZodString>;
    purchasedRoute: z.ZodOptional<z.ZodEnum<{
        all: "all";
        messages: "messages";
        photos: "photos";
        posts: "posts";
        videos: "videos";
    }>>;
    creatorUsername: z.ZodOptional<z.ZodString>;
    linkedChatId: z.ZodOptional<z.ZodString>;
    state: z.ZodEnum<{
        "auth-required": "auth-required";
        complete: "complete";
        error: "error";
        idle: "idle";
        mapping: "mapping";
        partial: "partial";
    }>;
    category: z.ZodOptional<z.ZodEnum<{
        media: "media";
        photos: "photos";
        posts: "posts";
        videos: "videos";
    }>>;
    updatedAt: z.ZodNumber;
    pages: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        postId: z.ZodString;
        category: z.ZodEnum<{
            photos: "photos";
            videos: "videos";
        }>;
        state: z.ZodEnum<{
            available: "available";
            drm: "drm";
            locked: "locked";
            unsupported: "unsupported";
        }>;
        downloaded: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const OnlyFansCommandSchema: z.ZodObject<{
    url: z.ZodString;
    action: z.ZodEnum<{
        get: "get";
        map: "map";
        open: "open";
        stop: "stop";
    }>;
    category: z.ZodDefault<z.ZodEnum<{
        media: "media";
        photos: "photos";
        posts: "posts";
        videos: "videos";
    }>>;
}, z.core.$strip>;
export declare const OnlyFansDownloadSchema: z.ZodObject<{
    url: z.ZodString;
    itemIds: z.ZodArray<z.ZodString>;
    customDownloadPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type OnlyFansProfile = z.infer<typeof OnlyFansProfileSchema>;
export type OnlyFansItem = z.infer<typeof OnlyFansItemSchema>;
export type OnlyFansCommand = z.input<typeof OnlyFansCommandSchema>;
export type OnlyFansDownload = z.infer<typeof OnlyFansDownloadSchema>;
export declare function onlyFansProfile(value: string): {
    username: string;
    profileUrl: string;
    chatId?: string;
    chatRoute?: OnlyFansChatRoute;
    purchasedUserId?: string;
    purchasedRoute?: OnlyFansPurchasedRoute;
} | null;
export declare function isOnlyFansSite(value: string): boolean;
/** API sessions must stay in the browser that created them. */
export declare function assertOnlyFansBrowserSession(value: string): void;
