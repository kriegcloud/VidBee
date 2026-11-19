// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import { z } from 'zod';
export declare const SubscriptionPlatformSchema: z.ZodEnum<{
    bilibili: "bilibili";
    custom: "custom";
    instagram: "instagram";
    snapchat: "snapchat";
    threads: "threads";
    tiktok: "tiktok";
    x: "x";
    youtube: "youtube";
}>;
export declare const SubscriptionSourceKindSchema: z.ZodEnum<{
    feed: "feed";
    profile: "profile";
}>;
export declare const SubscriptionStatusSchema: z.ZodEnum<{
    "auth-required": "auth-required";
    checking: "checking";
    failed: "failed";
    idle: "idle";
    "rate-limited": "rate-limited";
    "up-to-date": "up-to-date";
}>;
export declare const LeaderKindSchema: z.ZodEnum<{
    api: "api";
    desktop: "desktop";
}>;
export declare const ResolvedFeedSchema: z.ZodObject<{
    sourceUrl: z.ZodString;
    feedUrl: z.ZodString;
    platform: z.ZodEnum<{
        bilibili: "bilibili";
        custom: "custom";
        instagram: "instagram";
        snapchat: "snapchat";
        threads: "threads";
        tiktok: "tiktok";
        x: "x";
        youtube: "youtube";
    }>;
    sourceKind: z.ZodEnum<{
        feed: "feed";
        profile: "profile";
    }>;
    profileOwner: z.ZodOptional<z.ZodString>;
    availableCategories: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const SubscriptionRuleSchema: z.ZodObject<{
    downloadType: z.ZodOptional<z.ZodUnion<[z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>, z.ZodLiteral<"subtitles">]>>;
    downloadQuality: z.ZodOptional<z.ZodEnum<{
        bad: "bad";
        best: "best";
        good: "good";
        normal: "normal";
        worst: "worst";
    }>>;
    downloadContainer: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    id: z.ZodString;
    title: z.ZodString;
    sourceUrl: z.ZodString;
    feedUrl: z.ZodString;
    platform: z.ZodEnum<{
        bilibili: "bilibili";
        custom: "custom";
        instagram: "instagram";
        snapchat: "snapchat";
        threads: "threads";
        tiktok: "tiktok";
        x: "x";
        youtube: "youtube";
    }>;
    keywords: z.ZodArray<z.ZodString>;
    tags: z.ZodArray<z.ZodString>;
    onlyDownloadLatest: z.ZodBoolean;
    autoDownload: z.ZodBoolean;
    enabled: z.ZodBoolean;
    coverUrl: z.ZodOptional<z.ZodString>;
    latestVideoTitle: z.ZodOptional<z.ZodString>;
    latestVideoPublishedAt: z.ZodOptional<z.ZodNumber>;
    lastCheckedAt: z.ZodOptional<z.ZodNumber>;
    lastSuccessAt: z.ZodOptional<z.ZodNumber>;
    status: z.ZodEnum<{
        "auth-required": "auth-required";
        checking: "checking";
        failed: "failed";
        idle: "idle";
        "rate-limited": "rate-limited";
        "up-to-date": "up-to-date";
    }>;
    lastError: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    downloadDirectory: z.ZodOptional<z.ZodString>;
    namingTemplate: z.ZodOptional<z.ZodString>;
    sourceKind: z.ZodEnum<{
        feed: "feed";
        profile: "profile";
    }>;
    profileOwner: z.ZodOptional<z.ZodString>;
    categories: z.ZodArray<z.ZodString>;
    checkIntervalMs: z.ZodOptional<z.ZodNumber>;
    nextCheckAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const SubscriptionFeedItemSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    title: z.ZodString;
    publishedAt: z.ZodNumber;
    thumbnail: z.ZodOptional<z.ZodString>;
    addedToQueue: z.ZodBoolean;
    taskId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const SubscriptionWithItemsSchema: z.ZodObject<{
    downloadType: z.ZodOptional<z.ZodUnion<[z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>, z.ZodLiteral<"subtitles">]>>;
    downloadQuality: z.ZodOptional<z.ZodEnum<{
        bad: "bad";
        best: "best";
        good: "good";
        normal: "normal";
        worst: "worst";
    }>>;
    downloadContainer: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    id: z.ZodString;
    title: z.ZodString;
    sourceUrl: z.ZodString;
    feedUrl: z.ZodString;
    platform: z.ZodEnum<{
        bilibili: "bilibili";
        custom: "custom";
        instagram: "instagram";
        snapchat: "snapchat";
        threads: "threads";
        tiktok: "tiktok";
        x: "x";
        youtube: "youtube";
    }>;
    keywords: z.ZodArray<z.ZodString>;
    tags: z.ZodArray<z.ZodString>;
    onlyDownloadLatest: z.ZodBoolean;
    autoDownload: z.ZodBoolean;
    enabled: z.ZodBoolean;
    coverUrl: z.ZodOptional<z.ZodString>;
    latestVideoTitle: z.ZodOptional<z.ZodString>;
    latestVideoPublishedAt: z.ZodOptional<z.ZodNumber>;
    lastCheckedAt: z.ZodOptional<z.ZodNumber>;
    lastSuccessAt: z.ZodOptional<z.ZodNumber>;
    status: z.ZodEnum<{
        "auth-required": "auth-required";
        checking: "checking";
        failed: "failed";
        idle: "idle";
        "rate-limited": "rate-limited";
        "up-to-date": "up-to-date";
    }>;
    lastError: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    downloadDirectory: z.ZodOptional<z.ZodString>;
    namingTemplate: z.ZodOptional<z.ZodString>;
    sourceKind: z.ZodEnum<{
        feed: "feed";
        profile: "profile";
    }>;
    profileOwner: z.ZodOptional<z.ZodString>;
    categories: z.ZodArray<z.ZodString>;
    checkIntervalMs: z.ZodOptional<z.ZodNumber>;
    nextCheckAt: z.ZodOptional<z.ZodNumber>;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        title: z.ZodString;
        publishedAt: z.ZodNumber;
        thumbnail: z.ZodOptional<z.ZodString>;
        addedToQueue: z.ZodBoolean;
        taskId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SubscriptionCreateInputSchema: z.ZodObject<{
    downloadType: z.ZodOptional<z.ZodUnion<[z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>, z.ZodLiteral<"subtitles">]>>;
    downloadQuality: z.ZodOptional<z.ZodEnum<{
        bad: "bad";
        best: "best";
        good: "good";
        normal: "normal";
        worst: "worst";
    }>>;
    downloadContainer: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    sourceUrl: z.ZodString;
    feedUrl: z.ZodString;
    platform: z.ZodEnum<{
        bilibili: "bilibili";
        custom: "custom";
        instagram: "instagram";
        snapchat: "snapchat";
        threads: "threads";
        tiktok: "tiktok";
        x: "x";
        youtube: "youtube";
    }>;
    title: z.ZodOptional<z.ZodString>;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    onlyDownloadLatest: z.ZodOptional<z.ZodBoolean>;
    autoDownload: z.ZodOptional<z.ZodBoolean>;
    downloadDirectory: z.ZodOptional<z.ZodString>;
    namingTemplate: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    sourceKind: z.ZodOptional<z.ZodEnum<{
        feed: "feed";
        profile: "profile";
    }>>;
    profileOwner: z.ZodOptional<z.ZodString>;
    categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
    checkIntervalMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const SubscriptionUpdateInputSchema: z.ZodObject<{
    downloadType: z.ZodOptional<z.ZodUnion<[z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>, z.ZodLiteral<"subtitles">]>>;
    downloadQuality: z.ZodOptional<z.ZodEnum<{
        bad: "bad";
        best: "best";
        good: "good";
        normal: "normal";
        worst: "worst";
    }>>;
    downloadContainer: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    title: z.ZodOptional<z.ZodString>;
    sourceUrl: z.ZodOptional<z.ZodString>;
    feedUrl: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodEnum<{
        bilibili: "bilibili";
        custom: "custom";
        instagram: "instagram";
        snapchat: "snapchat";
        threads: "threads";
        tiktok: "tiktok";
        x: "x";
        youtube: "youtube";
    }>>;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    onlyDownloadLatest: z.ZodOptional<z.ZodBoolean>;
    autoDownload: z.ZodOptional<z.ZodBoolean>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    downloadDirectory: z.ZodOptional<z.ZodString>;
    namingTemplate: z.ZodOptional<z.ZodString>;
    categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
    checkIntervalMs: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
export declare const SubscriptionIdInputSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const ResolveInputSchema: z.ZodObject<{
    rawUrl: z.ZodString;
}, z.core.$strip>;
export declare const RefreshInputSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const ItemsListInputSchema: z.ZodObject<{
    subscriptionId: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const ItemsQueueInputSchema: z.ZodObject<{
    subscriptionId: z.ZodString;
    itemId: z.ZodString;
}, z.core.$strip>;
export declare const SubscriptionListOutputSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        downloadType: z.ZodOptional<z.ZodUnion<[z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>, z.ZodLiteral<"subtitles">]>>;
        downloadQuality: z.ZodOptional<z.ZodEnum<{
            bad: "bad";
            best: "best";
            good: "good";
            normal: "normal";
            worst: "worst";
        }>>;
        downloadContainer: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            mkv: "mkv";
            mp4: "mp4";
            original: "original";
            webm: "webm";
        }>>;
        id: z.ZodString;
        title: z.ZodString;
        sourceUrl: z.ZodString;
        feedUrl: z.ZodString;
        platform: z.ZodEnum<{
            bilibili: "bilibili";
            custom: "custom";
            instagram: "instagram";
            snapchat: "snapchat";
            threads: "threads";
            tiktok: "tiktok";
            x: "x";
            youtube: "youtube";
        }>;
        keywords: z.ZodArray<z.ZodString>;
        tags: z.ZodArray<z.ZodString>;
        onlyDownloadLatest: z.ZodBoolean;
        autoDownload: z.ZodBoolean;
        enabled: z.ZodBoolean;
        coverUrl: z.ZodOptional<z.ZodString>;
        latestVideoTitle: z.ZodOptional<z.ZodString>;
        latestVideoPublishedAt: z.ZodOptional<z.ZodNumber>;
        lastCheckedAt: z.ZodOptional<z.ZodNumber>;
        lastSuccessAt: z.ZodOptional<z.ZodNumber>;
        status: z.ZodEnum<{
            "auth-required": "auth-required";
            checking: "checking";
            failed: "failed";
            idle: "idle";
            "rate-limited": "rate-limited";
            "up-to-date": "up-to-date";
        }>;
        lastError: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
        downloadDirectory: z.ZodOptional<z.ZodString>;
        namingTemplate: z.ZodOptional<z.ZodString>;
        sourceKind: z.ZodEnum<{
            feed: "feed";
            profile: "profile";
        }>;
        profileOwner: z.ZodOptional<z.ZodString>;
        categories: z.ZodArray<z.ZodString>;
        checkIntervalMs: z.ZodOptional<z.ZodNumber>;
        nextCheckAt: z.ZodOptional<z.ZodNumber>;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodString;
            title: z.ZodString;
            publishedAt: z.ZodNumber;
            thumbnail: z.ZodOptional<z.ZodString>;
            addedToQueue: z.ZodBoolean;
            taskId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const SubscriptionItemsListOutputSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        title: z.ZodString;
        publishedAt: z.ZodNumber;
        thumbnail: z.ZodOptional<z.ZodString>;
        addedToQueue: z.ZodBoolean;
        taskId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const ItemsQueueOutputSchema: z.ZodObject<{
    queued: z.ZodBoolean;
    taskId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const VoidOutputSchema: z.ZodObject<{}, z.core.$strip>;
export declare const LeaderStateSchema: z.ZodObject<{
    kind: z.ZodNullable<z.ZodEnum<{
        api: "api";
        desktop: "desktop";
    }>>;
    pid: z.ZodNullable<z.ZodNumber>;
    startedAt: z.ZodNullable<z.ZodNumber>;
    heartbeatAt: z.ZodNullable<z.ZodNumber>;
    lockExpiresAt: z.ZodNullable<z.ZodNumber>;
    leaseId: z.ZodNullable<z.ZodString>;
    preferred: z.ZodNullable<z.ZodEnum<{
        api: "api";
        desktop: "desktop";
    }>>;
}, z.core.$strip>;
