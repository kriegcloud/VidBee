import type { TaskQueueAPI } from '@vidbee/task-queue-legacy';
import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission';
import { z } from 'zod';
import { type GalleryDlExecutorOptions } from './gallery-dl-executor';
import type { MappedProfilePlatform } from './mapped-profile-source';
import type { SocialMediaOptions, SocialSource } from './social-media';
import type { DownloadRuntimeSettings } from './types';
export interface SocialMappedItem {
    id: string;
    url: string;
    author: string;
    title?: string;
    images: number;
    videos: number;
    downloaded?: boolean;
    /** Epoch ms of the post when the mapper can read it. */
    publishedAt?: number;
}
export interface SocialProfileCategory {
    state: 'unscanned' | 'mapping' | 'partial' | 'complete' | 'auth-required' | 'error';
    items: SocialMappedItem[];
    error?: string;
}
export interface SocialMappedProfile {
    profileUrl: string;
    platform: MappedProfilePlatform;
    owner: string;
    categories: Record<string, SocialProfileCategory>;
    updatedAt: number;
}
export declare const SocialMappedItemSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodURL;
    author: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    images: z.ZodNumber;
    videos: z.ZodNumber;
    downloaded: z.ZodOptional<z.ZodBoolean>;
    publishedAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const SocialProfileCategorySchema: z.ZodObject<{
    state: z.ZodEnum<{
        "auth-required": "auth-required";
        complete: "complete";
        error: "error";
        mapping: "mapping";
        partial: "partial";
        unscanned: "unscanned";
    }>;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodURL;
        author: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        images: z.ZodNumber;
        videos: z.ZodNumber;
        downloaded: z.ZodOptional<z.ZodBoolean>;
        publishedAt: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const SocialMappedProfileSchema: z.ZodObject<{
    profileUrl: z.ZodURL;
    platform: z.ZodEnum<{
        facebook: "facebook";
        pinterest: "pinterest";
        redgifs: "redgifs";
        snapchat: "snapchat";
        threads: "threads";
        tiktok: "tiktok";
        vsco: "vsco";
        x: "x";
    }>;
    owner: z.ZodString;
    categories: z.ZodRecord<z.ZodString, z.ZodObject<{
        state: z.ZodEnum<{
            "auth-required": "auth-required";
            complete: "complete";
            error: "error";
            mapping: "mapping";
            partial: "partial";
            unscanned: "unscanned";
        }>;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodURL;
            author: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            images: z.ZodNumber;
            videos: z.ZodNumber;
            downloaded: z.ZodOptional<z.ZodBoolean>;
            publishedAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        error: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
/** Shared by the X/TikTok and Threads mappers when a refresh may stop early. */
export interface ProfileMapOptions {
    /**
     * Post ids already in the saved map. The extractor stops after a run of
     * consecutive known posts instead of walking the whole timeline again.
     */
    knownIds?: readonly string[];
}
/** Write known post ids where the gallery-dl module can read them. */
export declare const writeKnownItemsFile: (directory: string, knownIds: readonly string[] | undefined) => Promise<string | undefined>;
/** Map post references only; signed media URLs never enter the saved profile. */
export declare const mapSocialMediaProfile: (url: string, runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & {
    admission?: SourceAdmission;
}, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void, options?: ProfileMapOptions) => Promise<{
    complete: boolean;
    error?: string;
}>;
export interface SocialMediaDownloadRequest {
    url: string;
    categories?: string[];
    options?: Partial<SocialMediaOptions>;
    customDownloadPath?: string;
    settings?: DownloadRuntimeSettings;
}
export declare const inspectSocialMedia: (url: string) => Promise<SocialSource>;
/** Queue each explicitly selected category through the same host-neutral executor. */
export declare const downloadSocialMedia: (queue: TaskQueueAPI, request: SocialMediaDownloadRequest, batch?: {
    id: string;
    title: string;
    order: number;
}) => Promise<{
    groupId: string;
    ids: string[];
}>;
export declare const restoreSocialMediaGroupCaps: (queue: TaskQueueAPI) => Promise<void>;
/** Inspect at most three media-bearing posts without downloading their assets. */
export declare const previewSocialMedia: (url: string, runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & {
    admission?: SourceAdmission;
}, settings?: DownloadRuntimeSettings) => Promise<{
    source: {
        platform: "instagram" | "reddit" | "tiktok" | "x";
        url: string;
        kind: "feed" | "image" | "post" | "profile" | "unsupported";
        category: string;
        owner: string;
        supportsThread: boolean;
        requiresAuth: boolean;
        categories: {
            key: string;
            url: string;
            requiresAuth: boolean;
        }[];
    };
    preview: {
        posts: number;
        images: number;
        videos: number;
        limited: boolean;
    };
}>;
