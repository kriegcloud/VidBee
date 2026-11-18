import { z } from 'zod';
export declare const FanslyCommandSchema: z.ZodObject<{
    url: z.ZodString;
    action: z.ZodEnum<{
        get: "get";
        map: "map";
        open: "open";
        stop: "stop";
    }>;
    category: z.ZodDefault<z.ZodEnum<{
        media: "media";
        posts: "posts";
    }>>;
}, z.core.$strip>;
export declare const FanslyProfileSchema: z.ZodObject<{
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
export declare const FanslyDownloadSchema: z.ZodObject<{
    url: z.ZodString;
    itemIds: z.ZodArray<z.ZodString>;
    customDownloadPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type FanslyCommand = z.input<typeof FanslyCommandSchema>;
export type FanslyDownload = z.infer<typeof FanslyDownloadSchema>;
export declare function fanslyProfile(value: string): {
    username: string;
    profileUrl: string;
} | null;
export declare function isFanslySite(value: string): boolean;
