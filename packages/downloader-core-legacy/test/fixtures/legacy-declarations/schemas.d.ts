import { z } from 'zod';
export declare const DownloadTypeSchema: z.ZodEnum<{
    audio: "audio";
    video: "video";
}>;
export declare const DownloadStatusSchema: z.ZodEnum<{
    cancelled: "cancelled";
    completed: "completed";
    downloading: "downloading";
    error: "error";
    pending: "pending";
    processing: "processing";
}>;
export declare const DownloadProgressSchema: z.ZodObject<{
    percent: z.ZodNumber;
    indeterminate: z.ZodOptional<z.ZodBoolean>;
    currentSpeed: z.ZodOptional<z.ZodString>;
    eta: z.ZodOptional<z.ZodString>;
    downloaded: z.ZodOptional<z.ZodString>;
    total: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const SocialCollectionSummarySchema: z.ZodObject<{
    posts: z.ZodNumber;
    images: z.ZodNumber;
    videos: z.ZodNumber;
    downloaded: z.ZodNumber;
    existing: z.ZodNumber;
    failed: z.ZodNumber;
    totalSize: z.ZodNumber;
    reason: z.ZodEnum<{
        exhausted: "exhausted";
        incomplete: "incomplete";
        limit: "limit";
    }>;
    manifestPath: z.ZodString;
    startedAt: z.ZodNumber;
    finishedAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const DownloadTaskSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodURL;
    title: z.ZodOptional<z.ZodString>;
    thumbnail: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>;
    status: z.ZodEnum<{
        cancelled: "cancelled";
        completed: "completed";
        downloading: "downloading";
        error: "error";
        pending: "pending";
        processing: "processing";
    }>;
    createdAt: z.ZodNumber;
    startedAt: z.ZodOptional<z.ZodNumber>;
    completedAt: z.ZodOptional<z.ZodNumber>;
    duration: z.ZodOptional<z.ZodNumber>;
    fileSize: z.ZodOptional<z.ZodNumber>;
    speed: z.ZodOptional<z.ZodString>;
    ytDlpCommand: z.ZodOptional<z.ZodString>;
    ytDlpLog: z.ZodOptional<z.ZodString>;
    cookieSources: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<{
            browser: "browser";
            config: "config";
            extension: "extension";
            file: "file";
        }>;
        browser: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    downloadPath: z.ZodOptional<z.ZodString>;
    savedFileName: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodString>;
    uploader: z.ZodOptional<z.ZodString>;
    viewCount: z.ZodOptional<z.ZodNumber>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    selectedFormat: z.ZodOptional<z.ZodLazy<z.ZodObject<{
        formatId: z.ZodString;
        ext: z.ZodString;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
        fps: z.ZodOptional<z.ZodNumber>;
        vcodec: z.ZodOptional<z.ZodString>;
        acodec: z.ZodOptional<z.ZodString>;
        filesize: z.ZodOptional<z.ZodNumber>;
        filesizeApprox: z.ZodOptional<z.ZodNumber>;
        formatNote: z.ZodOptional<z.ZodString>;
        tbr: z.ZodOptional<z.ZodNumber>;
        quality: z.ZodOptional<z.ZodNumber>;
        protocol: z.ZodOptional<z.ZodString>;
        language: z.ZodOptional<z.ZodString>;
        videoExt: z.ZodOptional<z.ZodString>;
        audioExt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    playlistId: z.ZodOptional<z.ZodString>;
    playlistTitle: z.ZodOptional<z.ZodString>;
    playlistIndex: z.ZodOptional<z.ZodNumber>;
    playlistSize: z.ZodOptional<z.ZodNumber>;
    mediaKind: z.ZodOptional<z.ZodEnum<{
        photo: "photo";
        recording: "recording";
        video: "video";
    }>>;
    batchId: z.ZodOptional<z.ZodString>;
    batchKind: z.ZodOptional<z.ZodEnum<{
        "instagram-profile": "instagram-profile";
        "social-media": "social-media";
    }>>;
    batchTitle: z.ZodOptional<z.ZodString>;
    batchCategory: z.ZodOptional<z.ZodString>;
    batchOrder: z.ZodOptional<z.ZodNumber>;
    batchSourceCount: z.ZodOptional<z.ZodNumber>;
    batchAssetCount: z.ZodOptional<z.ZodNumber>;
    outputDirectory: z.ZodOptional<z.ZodString>;
    sourceMediaKind: z.ZodOptional<z.ZodEnum<{
        image: "image";
        mixed: "mixed";
        video: "video";
    }>>;
    socialMedia: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
    collectionSummary: z.ZodOptional<z.ZodObject<{
        posts: z.ZodNumber;
        images: z.ZodNumber;
        videos: z.ZodNumber;
        downloaded: z.ZodNumber;
        existing: z.ZodNumber;
        failed: z.ZodNumber;
        totalSize: z.ZodNumber;
        reason: z.ZodEnum<{
            exhausted: "exhausted";
            incomplete: "incomplete";
            limit: "limit";
        }>;
        manifestPath: z.ZodString;
        startedAt: z.ZodNumber;
        finishedAt: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    fileCount: z.ZodOptional<z.ZodNumber>;
    downloadedCount: z.ZodOptional<z.ZodNumber>;
    skippedCount: z.ZodOptional<z.ZodNumber>;
    failedCount: z.ZodOptional<z.ZodNumber>;
    totalSize: z.ZodOptional<z.ZodNumber>;
    progress: z.ZodOptional<z.ZodObject<{
        percent: z.ZodNumber;
        indeterminate: z.ZodOptional<z.ZodBoolean>;
        currentSpeed: z.ZodOptional<z.ZodString>;
        eta: z.ZodOptional<z.ZodString>;
        downloaded: z.ZodOptional<z.ZodString>;
        total: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    error: z.ZodOptional<z.ZodString>;
    internalStatus: z.ZodOptional<z.ZodEnum<{
        cancelled: "cancelled";
        completed: "completed";
        failed: "failed";
        paused: "paused";
        processing: "processing";
        queued: "queued";
        "retry-scheduled": "retry-scheduled";
        running: "running";
    }>>;
    subStatus: z.ZodOptional<z.ZodEnum<{
        paused: "paused";
        queued: "queued";
        "retry-scheduled": "retry-scheduled";
    }>>;
    statusReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    errorCategory: z.ZodOptional<z.ZodEnum<{
        "auth-required": "auth-required";
        "binary-missing": "binary-missing";
        "cancelled-by-user": "cancelled-by-user";
        "disk-full": "disk-full";
        ffmpeg: "ffmpeg";
        "geo-blocked": "geo-blocked";
        "http-429": "http-429";
        "network-transient": "network-transient";
        "not-found": "not-found";
        "output-missing": "output-missing";
        "permission-denied": "permission-denied";
        stalled: "stalled";
        unknown: "unknown";
    }>>;
    uiMessageKey: z.ZodOptional<z.ZodString>;
    nextRetryAt: z.ZodOptional<z.ZodNumber>;
    attempt: z.ZodOptional<z.ZodNumber>;
    maxAttempts: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const DownloadRuntimeSettingsSchema: z.ZodObject<{
    downloadPath: z.ZodOptional<z.ZodString>;
    browserForCookies: z.ZodOptional<z.ZodString>;
    cookiesPath: z.ZodOptional<z.ZodString>;
    proxy: z.ZodOptional<z.ZodString>;
    configPath: z.ZodOptional<z.ZodString>;
    downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
    subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    interfaceLanguage: z.ZodOptional<z.ZodString>;
    embedSubs: z.ZodOptional<z.ZodBoolean>;
    writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
    embedThumbnail: z.ZodOptional<z.ZodBoolean>;
    embedMetadata: z.ZodOptional<z.ZodBoolean>;
    embedChapters: z.ZodOptional<z.ZodBoolean>;
    filenameStyle: z.ZodOptional<z.ZodEnum<{
        basic: "basic";
        classic: "classic";
        nerdy: "nerdy";
        pretty: "pretty";
    }>>;
    filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
    shareWatermark: z.ZodOptional<z.ZodBoolean>;
    downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
    downloadMirror: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        cn: "cn";
        global: "global";
    }>>;
}, z.core.$strip>;
export declare const OneClickQualityPresetSchema: z.ZodEnum<{
    bad: "bad";
    best: "best";
    good: "good";
    normal: "normal";
    worst: "worst";
}>;
export declare const OneClickContainerOptionSchema: z.ZodEnum<{
    auto: "auto";
    mkv: "mkv";
    mp4: "mp4";
    original: "original";
    webm: "webm";
}>;
export declare const ThemeValueSchema: z.ZodEnum<{
    dark: "dark";
    light: "light";
    system: "system";
}>;
export declare const WebAppSettingsSchema: z.ZodObject<{
    downloadPath: z.ZodString;
    maxConcurrentDownloads: z.ZodNumber;
    browserForCookies: z.ZodString;
    cookiesPath: z.ZodString;
    proxy: z.ZodString;
    configPath: z.ZodString;
    language: z.ZodString;
    theme: z.ZodEnum<{
        dark: "dark";
        light: "light";
        system: "system";
    }>;
    oneClickDownload: z.ZodBoolean;
    oneClickDownloadType: z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>;
    oneClickQuality: z.ZodEnum<{
        bad: "bad";
        best: "best";
        good: "good";
        normal: "normal";
        worst: "worst";
    }>;
    oneClickContainer: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    closeToTray: z.ZodBoolean;
    subscriptionOnlyLatestDefault: z.ZodBoolean;
    downloadSubtitles: z.ZodDefault<z.ZodBoolean>;
    subtitleLanguages: z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>;
    embedSubs: z.ZodBoolean;
    writeAutoSubs: z.ZodDefault<z.ZodBoolean>;
    embedThumbnail: z.ZodBoolean;
    embedMetadata: z.ZodBoolean;
    embedChapters: z.ZodBoolean;
    filenameStyle: z.ZodDefault<z.ZodEnum<{
        basic: "basic";
        classic: "classic";
        nerdy: "nerdy";
        pretty: "pretty";
    }>>;
    filenameViaVidBee: z.ZodDefault<z.ZodBoolean>;
    shareWatermark: z.ZodBoolean;
    downloadWithoutChannelSubfolders: z.ZodDefault<z.ZodBoolean>;
    downloadMirror: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        cn: "cn";
        global: "global";
    }>>;
    enableDownloadNotifications: z.ZodDefault<z.ZodBoolean>;
    rememberLastAudioLanguage: z.ZodDefault<z.ZodBoolean>;
    preferredAudioLanguage: z.ZodDefault<z.ZodString>;
    autoTranscribeAfterDownload: z.ZodDefault<z.ZodBoolean>;
    maxConcurrentTranscriptions: z.ZodDefault<z.ZodNumber>;
    asrTier: z.ZodPreprocess<z.ZodDefault<z.ZodEnum<{
        balanced: "balanced";
        "fire-red-asr": "fire-red-asr";
        minimal: "minimal";
        orukeet: "orukeet";
        "parakeet-v2": "parakeet-v2";
        "parakeet-v3": "parakeet-v3";
        quality: "quality";
        "qwen3-1.7b": "qwen3-1.7b";
        "sense-voice": "sense-voice";
        "sense-voice-2025": "sense-voice-2025";
        "whisper-base": "whisper-base";
        "whisper-medium": "whisper-medium";
        "whisper-turbo": "whisper-turbo";
    }>>, unknown>;
}, z.core.$strip>;
export declare const CreateDownloadInputSchema: z.ZodObject<{
    singleVideo: z.ZodOptional<z.ZodBoolean>;
    socialMedia: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
    url: z.ZodURL;
    type: z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>;
    title: z.ZodOptional<z.ZodString>;
    thumbnail: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodString>;
    uploader: z.ZodOptional<z.ZodString>;
    viewCount: z.ZodOptional<z.ZodNumber>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    selectedFormat: z.ZodOptional<z.ZodLazy<z.ZodObject<{
        formatId: z.ZodString;
        ext: z.ZodString;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
        fps: z.ZodOptional<z.ZodNumber>;
        vcodec: z.ZodOptional<z.ZodString>;
        acodec: z.ZodOptional<z.ZodString>;
        filesize: z.ZodOptional<z.ZodNumber>;
        filesizeApprox: z.ZodOptional<z.ZodNumber>;
        formatNote: z.ZodOptional<z.ZodString>;
        tbr: z.ZodOptional<z.ZodNumber>;
        quality: z.ZodOptional<z.ZodNumber>;
        protocol: z.ZodOptional<z.ZodString>;
        language: z.ZodOptional<z.ZodString>;
        videoExt: z.ZodOptional<z.ZodString>;
        audioExt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    playlistId: z.ZodOptional<z.ZodString>;
    playlistTitle: z.ZodOptional<z.ZodString>;
    playlistIndex: z.ZodOptional<z.ZodNumber>;
    playlistSize: z.ZodOptional<z.ZodNumber>;
    format: z.ZodOptional<z.ZodString>;
    audioFormat: z.ZodOptional<z.ZodString>;
    audioFormatIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    startTime: z.ZodOptional<z.ZodString>;
    endTime: z.ZodOptional<z.ZodString>;
    customDownloadPath: z.ZodOptional<z.ZodString>;
    customFilenameTemplate: z.ZodOptional<z.ZodString>;
    containerFormat: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const VideoInfoInputSchema: z.ZodObject<{
    url: z.ZodURL;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ResolveUrlInputSchema: z.ZodObject<{
    url: z.ZodURL;
}, z.core.$strip>;
export declare const ResolveUrlOutputSchema: z.ZodObject<{
    url: z.ZodString;
}, z.core.$strip>;
export declare const PlaylistInfoInputSchema: z.ZodObject<{
    url: z.ZodURL;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const VideoFormatSchema: z.ZodObject<{
    formatId: z.ZodString;
    ext: z.ZodString;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
    fps: z.ZodOptional<z.ZodNumber>;
    vcodec: z.ZodOptional<z.ZodString>;
    acodec: z.ZodOptional<z.ZodString>;
    filesize: z.ZodOptional<z.ZodNumber>;
    filesizeApprox: z.ZodOptional<z.ZodNumber>;
    formatNote: z.ZodOptional<z.ZodString>;
    tbr: z.ZodOptional<z.ZodNumber>;
    quality: z.ZodOptional<z.ZodNumber>;
    protocol: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    videoExt: z.ZodOptional<z.ZodString>;
    audioExt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const VideoInfoSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    thumbnail: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    extractorKey: z.ZodOptional<z.ZodString>;
    webpageUrl: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    viewCount: z.ZodOptional<z.ZodNumber>;
    uploader: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    formats: z.ZodArray<z.ZodObject<{
        formatId: z.ZodString;
        ext: z.ZodString;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
        fps: z.ZodOptional<z.ZodNumber>;
        vcodec: z.ZodOptional<z.ZodString>;
        acodec: z.ZodOptional<z.ZodString>;
        filesize: z.ZodOptional<z.ZodNumber>;
        filesizeApprox: z.ZodOptional<z.ZodNumber>;
        formatNote: z.ZodOptional<z.ZodString>;
        tbr: z.ZodOptional<z.ZodNumber>;
        quality: z.ZodOptional<z.ZodNumber>;
        protocol: z.ZodOptional<z.ZodString>;
        language: z.ZodOptional<z.ZodString>;
        videoExt: z.ZodOptional<z.ZodString>;
        audioExt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PlaylistMediaKindSchema: z.ZodEnum<{
    photo: "photo";
    recording: "recording";
    video: "video";
}>;
export declare const PlaylistEntrySchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    url: z.ZodURL;
    index: z.ZodNumber;
    thumbnail: z.ZodOptional<z.ZodString>;
    mediaKind: z.ZodOptional<z.ZodEnum<{
        photo: "photo";
        recording: "recording";
        video: "video";
    }>>;
}, z.core.$strip>;
export declare const PlaylistInfoSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        url: z.ZodURL;
        index: z.ZodNumber;
        thumbnail: z.ZodOptional<z.ZodString>;
        mediaKind: z.ZodOptional<z.ZodEnum<{
            photo: "photo";
            recording: "recording";
            video: "video";
        }>>;
    }, z.core.$strip>>;
    entryCount: z.ZodNumber;
}, z.core.$strip>;
export declare const PlaylistDownloadInputSchema: z.ZodObject<{
    url: z.ZodURL;
    type: z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>;
    format: z.ZodOptional<z.ZodString>;
    audioFormat: z.ZodOptional<z.ZodString>;
    audioFormatIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    customDownloadPath: z.ZodOptional<z.ZodString>;
    customFilenameTemplate: z.ZodOptional<z.ZodString>;
    entryIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    startIndex: z.ZodOptional<z.ZodNumber>;
    endIndex: z.ZodOptional<z.ZodNumber>;
    containerFormat: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        mkv: "mkv";
        mp4: "mp4";
        original: "original";
        webm: "webm";
    }>>;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PlaylistDownloadEntrySchema: z.ZodObject<{
    downloadId: z.ZodString;
    entryId: z.ZodString;
    title: z.ZodString;
    url: z.ZodURL;
    index: z.ZodNumber;
}, z.core.$strip>;
export declare const PlaylistDownloadResultSchema: z.ZodObject<{
    groupId: z.ZodString;
    playlistId: z.ZodString;
    playlistTitle: z.ZodString;
    type: z.ZodEnum<{
        audio: "audio";
        video: "video";
    }>;
    totalCount: z.ZodNumber;
    startIndex: z.ZodNumber;
    endIndex: z.ZodNumber;
    entries: z.ZodArray<z.ZodObject<{
        downloadId: z.ZodString;
        entryId: z.ZodString;
        title: z.ZodString;
        url: z.ZodURL;
        index: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const InstagramProfileCategorySchema: z.ZodEnum<{
    highlights: "highlights";
    posts: "posts";
    reels: "reels";
    stories: "stories";
    tagged: "tagged";
}>;
export declare const InstagramCategoryStateSchema: z.ZodEnum<{
    "auth-required": "auth-required";
    cancelled: "cancelled";
    empty: "empty";
    ready: "ready";
    unavailable: "unavailable";
    unscanned: "unscanned";
}>;
export declare const InstagramInspectionErrorCodeSchema: z.ZodEnum<{
    "auth-required": "auth-required";
    "binary-missing": "binary-missing";
    network: "network";
    "not-found": "not-found";
    "rate-limited": "rate-limited";
    unavailable: "unavailable";
}>;
export declare const InstagramCategorySummarySchema: z.ZodObject<{
    incremental: z.ZodOptional<z.ZodBoolean>;
    cursor: z.ZodOptional<z.ZodString>;
    category: z.ZodEnum<{
        highlights: "highlights";
        posts: "posts";
        reels: "reels";
        stories: "stories";
        tagged: "tagged";
    }>;
    state: z.ZodEnum<{
        "auth-required": "auth-required";
        cancelled: "cancelled";
        empty: "empty";
        ready: "ready";
        unavailable: "unavailable";
        unscanned: "unscanned";
    }>;
    sourceCount: z.ZodNumber;
    assetCount: z.ZodNumber;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodURL;
        assetCount: z.ZodNumber;
        assetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        sourceVersion: z.ZodOptional<z.ZodString>;
        downloaded: z.ZodOptional<z.ZodBoolean>;
        title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    mappedAt: z.ZodOptional<z.ZodNumber>;
    errorCode: z.ZodOptional<z.ZodEnum<{
        "auth-required": "auth-required";
        "binary-missing": "binary-missing";
        network: "network";
        "not-found": "not-found";
        "rate-limited": "rate-limited";
        unavailable: "unavailable";
    }>>;
    retryAfter: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const InstagramProfileInspectInputSchema: z.ZodObject<{
    url: z.ZodURL;
    categories: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        highlights: "highlights";
        posts: "posts";
        reels: "reels";
        stories: "stories";
        tagged: "tagged";
    }>>>;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const InstagramProfileInspectionSchema: z.ZodObject<{
    mapping: z.ZodOptional<z.ZodObject<{
        category: z.ZodEnum<{
            highlights: "highlights";
            posts: "posts";
            reels: "reels";
            stories: "stories";
            tagged: "tagged";
        }>;
        state: z.ZodEnum<{
            queued: "queued";
            running: "running";
        }>;
    }, z.core.$strip>>;
    inspectionId: z.ZodString;
    expiresAt: z.ZodNumber;
    complete: z.ZodBoolean;
    profile: z.ZodObject<{
        username: z.ZodString;
        profileUrl: z.ZodURL;
        displayName: z.ZodOptional<z.ZodString>;
        avatarUrl: z.ZodOptional<z.ZodURL>;
        isPrivate: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    categories: z.ZodArray<z.ZodObject<{
        incremental: z.ZodOptional<z.ZodBoolean>;
        cursor: z.ZodOptional<z.ZodString>;
        category: z.ZodEnum<{
            highlights: "highlights";
            posts: "posts";
            reels: "reels";
            stories: "stories";
            tagged: "tagged";
        }>;
        state: z.ZodEnum<{
            "auth-required": "auth-required";
            cancelled: "cancelled";
            empty: "empty";
            ready: "ready";
            unavailable: "unavailable";
            unscanned: "unscanned";
        }>;
        sourceCount: z.ZodNumber;
        assetCount: z.ZodNumber;
        items: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodURL;
            assetCount: z.ZodNumber;
            assetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
            sourceVersion: z.ZodOptional<z.ZodString>;
            downloaded: z.ZodOptional<z.ZodBoolean>;
            title: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        mappedAt: z.ZodOptional<z.ZodNumber>;
        errorCode: z.ZodOptional<z.ZodEnum<{
            "auth-required": "auth-required";
            "binary-missing": "binary-missing";
            network: "network";
            "not-found": "not-found";
            "rate-limited": "rate-limited";
            unavailable: "unavailable";
        }>>;
        retryAfter: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    totalSourceCount: z.ZodNumber;
    totalAssetCount: z.ZodNumber;
}, z.core.$strip>;
export declare const InstagramProfileInspectOutputSchema: z.ZodObject<{
    inspection: z.ZodObject<{
        mapping: z.ZodOptional<z.ZodObject<{
            category: z.ZodEnum<{
                highlights: "highlights";
                posts: "posts";
                reels: "reels";
                stories: "stories";
                tagged: "tagged";
            }>;
            state: z.ZodEnum<{
                queued: "queued";
                running: "running";
            }>;
        }, z.core.$strip>>;
        inspectionId: z.ZodString;
        expiresAt: z.ZodNumber;
        complete: z.ZodBoolean;
        profile: z.ZodObject<{
            username: z.ZodString;
            profileUrl: z.ZodURL;
            displayName: z.ZodOptional<z.ZodString>;
            avatarUrl: z.ZodOptional<z.ZodURL>;
            isPrivate: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        categories: z.ZodArray<z.ZodObject<{
            incremental: z.ZodOptional<z.ZodBoolean>;
            cursor: z.ZodOptional<z.ZodString>;
            category: z.ZodEnum<{
                highlights: "highlights";
                posts: "posts";
                reels: "reels";
                stories: "stories";
                tagged: "tagged";
            }>;
            state: z.ZodEnum<{
                "auth-required": "auth-required";
                cancelled: "cancelled";
                empty: "empty";
                ready: "ready";
                unavailable: "unavailable";
                unscanned: "unscanned";
            }>;
            sourceCount: z.ZodNumber;
            assetCount: z.ZodNumber;
            items: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                url: z.ZodURL;
                assetCount: z.ZodNumber;
                assetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
                sourceVersion: z.ZodOptional<z.ZodString>;
                downloaded: z.ZodOptional<z.ZodBoolean>;
                title: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            mappedAt: z.ZodOptional<z.ZodNumber>;
            errorCode: z.ZodOptional<z.ZodEnum<{
                "auth-required": "auth-required";
                "binary-missing": "binary-missing";
                network: "network";
                "not-found": "not-found";
                "rate-limited": "rate-limited";
                unavailable: "unavailable";
            }>>;
            retryAfter: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        totalSourceCount: z.ZodNumber;
        totalAssetCount: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const InstagramProfileDownloadInputSchema: z.ZodObject<{
    inspectionId: z.ZodString;
    itemIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    categories: z.ZodArray<z.ZodEnum<{
        highlights: "highlights";
        posts: "posts";
        reels: "reels";
        stories: "stories";
        tagged: "tagged";
    }>>;
    customDownloadPath: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const InstagramProfileDownloadTaskSchema: z.ZodObject<{
    downloadId: z.ZodString;
    category: z.ZodEnum<{
        highlights: "highlights";
        posts: "posts";
        reels: "reels";
        stories: "stories";
        tagged: "tagged";
    }>;
    sourceCount: z.ZodNumber;
    assetCount: z.ZodNumber;
}, z.core.$strip>;
export declare const InstagramProfileDownloadResultSchema: z.ZodObject<{
    groupId: z.ZodString;
    username: z.ZodString;
    totalSourceCount: z.ZodNumber;
    totalAssetCount: z.ZodNumber;
    tasks: z.ZodArray<z.ZodObject<{
        downloadId: z.ZodString;
        category: z.ZodEnum<{
            highlights: "highlights";
            posts: "posts";
            reels: "reels";
            stories: "stories";
            tagged: "tagged";
        }>;
        sourceCount: z.ZodNumber;
        assetCount: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const InstagramProfileDownloadOutputSchema: z.ZodObject<{
    result: z.ZodObject<{
        groupId: z.ZodString;
        username: z.ZodString;
        totalSourceCount: z.ZodNumber;
        totalAssetCount: z.ZodNumber;
        tasks: z.ZodArray<z.ZodObject<{
            downloadId: z.ZodString;
            category: z.ZodEnum<{
                highlights: "highlights";
                posts: "posts";
                reels: "reels";
                stories: "stories";
                tagged: "tagged";
            }>;
            sourceCount: z.ZodNumber;
            assetCount: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const StatusOutputSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    version: z.ZodString;
    active: z.ZodNumber;
    pending: z.ZodNumber;
    downloadDir: z.ZodOptional<z.ZodString>;
    dataDir: z.ZodOptional<z.ZodString>;
    dbPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const EngineStatusSchema: z.ZodObject<{
    error: z.ZodNullable<z.ZodString>;
    ffmpegVersion: z.ZodNullable<z.ZodString>;
    latestYtDlpVersion: z.ZodNullable<z.ZodString>;
    nodeVersion: z.ZodString;
    state: z.ZodEnum<{
        checking: "checking";
        installing: "installing";
        unavailable: "unavailable";
        "up-to-date": "up-to-date";
        "update-available": "update-available";
    }>;
    ytDlpPath: z.ZodNullable<z.ZodString>;
    ytDlpVersion: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const CreateDownloadOutputSchema: z.ZodObject<{
    download: z.ZodObject<{
        id: z.ZodString;
        url: z.ZodURL;
        title: z.ZodOptional<z.ZodString>;
        thumbnail: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            completed: "completed";
            downloading: "downloading";
            error: "error";
            pending: "pending";
            processing: "processing";
        }>;
        createdAt: z.ZodNumber;
        startedAt: z.ZodOptional<z.ZodNumber>;
        completedAt: z.ZodOptional<z.ZodNumber>;
        duration: z.ZodOptional<z.ZodNumber>;
        fileSize: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodOptional<z.ZodString>;
        ytDlpCommand: z.ZodOptional<z.ZodString>;
        ytDlpLog: z.ZodOptional<z.ZodString>;
        cookieSources: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                browser: "browser";
                config: "config";
                extension: "extension";
                file: "file";
            }>;
            browser: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        downloadPath: z.ZodOptional<z.ZodString>;
        savedFileName: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        channel: z.ZodOptional<z.ZodString>;
        uploader: z.ZodOptional<z.ZodString>;
        viewCount: z.ZodOptional<z.ZodNumber>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        selectedFormat: z.ZodOptional<z.ZodLazy<z.ZodObject<{
            formatId: z.ZodString;
            ext: z.ZodString;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
            fps: z.ZodOptional<z.ZodNumber>;
            vcodec: z.ZodOptional<z.ZodString>;
            acodec: z.ZodOptional<z.ZodString>;
            filesize: z.ZodOptional<z.ZodNumber>;
            filesizeApprox: z.ZodOptional<z.ZodNumber>;
            formatNote: z.ZodOptional<z.ZodString>;
            tbr: z.ZodOptional<z.ZodNumber>;
            quality: z.ZodOptional<z.ZodNumber>;
            protocol: z.ZodOptional<z.ZodString>;
            language: z.ZodOptional<z.ZodString>;
            videoExt: z.ZodOptional<z.ZodString>;
            audioExt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        playlistId: z.ZodOptional<z.ZodString>;
        playlistTitle: z.ZodOptional<z.ZodString>;
        playlistIndex: z.ZodOptional<z.ZodNumber>;
        playlistSize: z.ZodOptional<z.ZodNumber>;
        mediaKind: z.ZodOptional<z.ZodEnum<{
            photo: "photo";
            recording: "recording";
            video: "video";
        }>>;
        batchId: z.ZodOptional<z.ZodString>;
        batchKind: z.ZodOptional<z.ZodEnum<{
            "instagram-profile": "instagram-profile";
            "social-media": "social-media";
        }>>;
        batchTitle: z.ZodOptional<z.ZodString>;
        batchCategory: z.ZodOptional<z.ZodString>;
        batchOrder: z.ZodOptional<z.ZodNumber>;
        batchSourceCount: z.ZodOptional<z.ZodNumber>;
        batchAssetCount: z.ZodOptional<z.ZodNumber>;
        outputDirectory: z.ZodOptional<z.ZodString>;
        sourceMediaKind: z.ZodOptional<z.ZodEnum<{
            image: "image";
            mixed: "mixed";
            video: "video";
        }>>;
        socialMedia: z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>;
        collectionSummary: z.ZodOptional<z.ZodObject<{
            posts: z.ZodNumber;
            images: z.ZodNumber;
            videos: z.ZodNumber;
            downloaded: z.ZodNumber;
            existing: z.ZodNumber;
            failed: z.ZodNumber;
            totalSize: z.ZodNumber;
            reason: z.ZodEnum<{
                exhausted: "exhausted";
                incomplete: "incomplete";
                limit: "limit";
            }>;
            manifestPath: z.ZodString;
            startedAt: z.ZodNumber;
            finishedAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        fileCount: z.ZodOptional<z.ZodNumber>;
        downloadedCount: z.ZodOptional<z.ZodNumber>;
        skippedCount: z.ZodOptional<z.ZodNumber>;
        failedCount: z.ZodOptional<z.ZodNumber>;
        totalSize: z.ZodOptional<z.ZodNumber>;
        progress: z.ZodOptional<z.ZodObject<{
            percent: z.ZodNumber;
            indeterminate: z.ZodOptional<z.ZodBoolean>;
            currentSpeed: z.ZodOptional<z.ZodString>;
            eta: z.ZodOptional<z.ZodString>;
            downloaded: z.ZodOptional<z.ZodString>;
            total: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        error: z.ZodOptional<z.ZodString>;
        internalStatus: z.ZodOptional<z.ZodEnum<{
            cancelled: "cancelled";
            completed: "completed";
            failed: "failed";
            paused: "paused";
            processing: "processing";
            queued: "queued";
            "retry-scheduled": "retry-scheduled";
            running: "running";
        }>>;
        subStatus: z.ZodOptional<z.ZodEnum<{
            paused: "paused";
            queued: "queued";
            "retry-scheduled": "retry-scheduled";
        }>>;
        statusReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        errorCategory: z.ZodOptional<z.ZodEnum<{
            "auth-required": "auth-required";
            "binary-missing": "binary-missing";
            "cancelled-by-user": "cancelled-by-user";
            "disk-full": "disk-full";
            ffmpeg: "ffmpeg";
            "geo-blocked": "geo-blocked";
            "http-429": "http-429";
            "network-transient": "network-transient";
            "not-found": "not-found";
            "output-missing": "output-missing";
            "permission-denied": "permission-denied";
            stalled: "stalled";
            unknown: "unknown";
        }>>;
        uiMessageKey: z.ZodOptional<z.ZodString>;
        nextRetryAt: z.ZodOptional<z.ZodNumber>;
        attempt: z.ZodOptional<z.ZodNumber>;
        maxAttempts: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ListDownloadsOutputSchema: z.ZodObject<{
    downloads: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodURL;
        title: z.ZodOptional<z.ZodString>;
        thumbnail: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            completed: "completed";
            downloading: "downloading";
            error: "error";
            pending: "pending";
            processing: "processing";
        }>;
        createdAt: z.ZodNumber;
        startedAt: z.ZodOptional<z.ZodNumber>;
        completedAt: z.ZodOptional<z.ZodNumber>;
        duration: z.ZodOptional<z.ZodNumber>;
        fileSize: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodOptional<z.ZodString>;
        ytDlpCommand: z.ZodOptional<z.ZodString>;
        ytDlpLog: z.ZodOptional<z.ZodString>;
        cookieSources: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                browser: "browser";
                config: "config";
                extension: "extension";
                file: "file";
            }>;
            browser: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        downloadPath: z.ZodOptional<z.ZodString>;
        savedFileName: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        channel: z.ZodOptional<z.ZodString>;
        uploader: z.ZodOptional<z.ZodString>;
        viewCount: z.ZodOptional<z.ZodNumber>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        selectedFormat: z.ZodOptional<z.ZodLazy<z.ZodObject<{
            formatId: z.ZodString;
            ext: z.ZodString;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
            fps: z.ZodOptional<z.ZodNumber>;
            vcodec: z.ZodOptional<z.ZodString>;
            acodec: z.ZodOptional<z.ZodString>;
            filesize: z.ZodOptional<z.ZodNumber>;
            filesizeApprox: z.ZodOptional<z.ZodNumber>;
            formatNote: z.ZodOptional<z.ZodString>;
            tbr: z.ZodOptional<z.ZodNumber>;
            quality: z.ZodOptional<z.ZodNumber>;
            protocol: z.ZodOptional<z.ZodString>;
            language: z.ZodOptional<z.ZodString>;
            videoExt: z.ZodOptional<z.ZodString>;
            audioExt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        playlistId: z.ZodOptional<z.ZodString>;
        playlistTitle: z.ZodOptional<z.ZodString>;
        playlistIndex: z.ZodOptional<z.ZodNumber>;
        playlistSize: z.ZodOptional<z.ZodNumber>;
        mediaKind: z.ZodOptional<z.ZodEnum<{
            photo: "photo";
            recording: "recording";
            video: "video";
        }>>;
        batchId: z.ZodOptional<z.ZodString>;
        batchKind: z.ZodOptional<z.ZodEnum<{
            "instagram-profile": "instagram-profile";
            "social-media": "social-media";
        }>>;
        batchTitle: z.ZodOptional<z.ZodString>;
        batchCategory: z.ZodOptional<z.ZodString>;
        batchOrder: z.ZodOptional<z.ZodNumber>;
        batchSourceCount: z.ZodOptional<z.ZodNumber>;
        batchAssetCount: z.ZodOptional<z.ZodNumber>;
        outputDirectory: z.ZodOptional<z.ZodString>;
        sourceMediaKind: z.ZodOptional<z.ZodEnum<{
            image: "image";
            mixed: "mixed";
            video: "video";
        }>>;
        socialMedia: z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>;
        collectionSummary: z.ZodOptional<z.ZodObject<{
            posts: z.ZodNumber;
            images: z.ZodNumber;
            videos: z.ZodNumber;
            downloaded: z.ZodNumber;
            existing: z.ZodNumber;
            failed: z.ZodNumber;
            totalSize: z.ZodNumber;
            reason: z.ZodEnum<{
                exhausted: "exhausted";
                incomplete: "incomplete";
                limit: "limit";
            }>;
            manifestPath: z.ZodString;
            startedAt: z.ZodNumber;
            finishedAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        fileCount: z.ZodOptional<z.ZodNumber>;
        downloadedCount: z.ZodOptional<z.ZodNumber>;
        skippedCount: z.ZodOptional<z.ZodNumber>;
        failedCount: z.ZodOptional<z.ZodNumber>;
        totalSize: z.ZodOptional<z.ZodNumber>;
        progress: z.ZodOptional<z.ZodObject<{
            percent: z.ZodNumber;
            indeterminate: z.ZodOptional<z.ZodBoolean>;
            currentSpeed: z.ZodOptional<z.ZodString>;
            eta: z.ZodOptional<z.ZodString>;
            downloaded: z.ZodOptional<z.ZodString>;
            total: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        error: z.ZodOptional<z.ZodString>;
        internalStatus: z.ZodOptional<z.ZodEnum<{
            cancelled: "cancelled";
            completed: "completed";
            failed: "failed";
            paused: "paused";
            processing: "processing";
            queued: "queued";
            "retry-scheduled": "retry-scheduled";
            running: "running";
        }>>;
        subStatus: z.ZodOptional<z.ZodEnum<{
            paused: "paused";
            queued: "queued";
            "retry-scheduled": "retry-scheduled";
        }>>;
        statusReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        errorCategory: z.ZodOptional<z.ZodEnum<{
            "auth-required": "auth-required";
            "binary-missing": "binary-missing";
            "cancelled-by-user": "cancelled-by-user";
            "disk-full": "disk-full";
            ffmpeg: "ffmpeg";
            "geo-blocked": "geo-blocked";
            "http-429": "http-429";
            "network-transient": "network-transient";
            "not-found": "not-found";
            "output-missing": "output-missing";
            "permission-denied": "permission-denied";
            stalled: "stalled";
            unknown: "unknown";
        }>>;
        uiMessageKey: z.ZodOptional<z.ZodString>;
        nextRetryAt: z.ZodOptional<z.ZodNumber>;
        attempt: z.ZodOptional<z.ZodNumber>;
        maxAttempts: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const CancelDownloadInputSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const CancelDownloadOutputSchema: z.ZodObject<{
    cancelled: z.ZodBoolean;
}, z.core.$strip>;
export declare const RetryDownloadInputSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const RetryDownloadOutputSchema: z.ZodObject<{
    retried: z.ZodBoolean;
}, z.core.$strip>;
export declare const PauseDownloadInputSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const PauseDownloadOutputSchema: z.ZodObject<{
    paused: z.ZodBoolean;
}, z.core.$strip>;
export declare const ResumeDownloadInputSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const ResumeDownloadOutputSchema: z.ZodObject<{
    resumed: z.ZodBoolean;
}, z.core.$strip>;
export declare const ListHistoryOutputSchema: z.ZodObject<{
    history: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodURL;
        title: z.ZodOptional<z.ZodString>;
        thumbnail: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            completed: "completed";
            downloading: "downloading";
            error: "error";
            pending: "pending";
            processing: "processing";
        }>;
        createdAt: z.ZodNumber;
        startedAt: z.ZodOptional<z.ZodNumber>;
        completedAt: z.ZodOptional<z.ZodNumber>;
        duration: z.ZodOptional<z.ZodNumber>;
        fileSize: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodOptional<z.ZodString>;
        ytDlpCommand: z.ZodOptional<z.ZodString>;
        ytDlpLog: z.ZodOptional<z.ZodString>;
        cookieSources: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                browser: "browser";
                config: "config";
                extension: "extension";
                file: "file";
            }>;
            browser: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        downloadPath: z.ZodOptional<z.ZodString>;
        savedFileName: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        channel: z.ZodOptional<z.ZodString>;
        uploader: z.ZodOptional<z.ZodString>;
        viewCount: z.ZodOptional<z.ZodNumber>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        selectedFormat: z.ZodOptional<z.ZodLazy<z.ZodObject<{
            formatId: z.ZodString;
            ext: z.ZodString;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
            fps: z.ZodOptional<z.ZodNumber>;
            vcodec: z.ZodOptional<z.ZodString>;
            acodec: z.ZodOptional<z.ZodString>;
            filesize: z.ZodOptional<z.ZodNumber>;
            filesizeApprox: z.ZodOptional<z.ZodNumber>;
            formatNote: z.ZodOptional<z.ZodString>;
            tbr: z.ZodOptional<z.ZodNumber>;
            quality: z.ZodOptional<z.ZodNumber>;
            protocol: z.ZodOptional<z.ZodString>;
            language: z.ZodOptional<z.ZodString>;
            videoExt: z.ZodOptional<z.ZodString>;
            audioExt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        playlistId: z.ZodOptional<z.ZodString>;
        playlistTitle: z.ZodOptional<z.ZodString>;
        playlistIndex: z.ZodOptional<z.ZodNumber>;
        playlistSize: z.ZodOptional<z.ZodNumber>;
        mediaKind: z.ZodOptional<z.ZodEnum<{
            photo: "photo";
            recording: "recording";
            video: "video";
        }>>;
        batchId: z.ZodOptional<z.ZodString>;
        batchKind: z.ZodOptional<z.ZodEnum<{
            "instagram-profile": "instagram-profile";
            "social-media": "social-media";
        }>>;
        batchTitle: z.ZodOptional<z.ZodString>;
        batchCategory: z.ZodOptional<z.ZodString>;
        batchOrder: z.ZodOptional<z.ZodNumber>;
        batchSourceCount: z.ZodOptional<z.ZodNumber>;
        batchAssetCount: z.ZodOptional<z.ZodNumber>;
        outputDirectory: z.ZodOptional<z.ZodString>;
        sourceMediaKind: z.ZodOptional<z.ZodEnum<{
            image: "image";
            mixed: "mixed";
            video: "video";
        }>>;
        socialMedia: z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>;
        collectionSummary: z.ZodOptional<z.ZodObject<{
            posts: z.ZodNumber;
            images: z.ZodNumber;
            videos: z.ZodNumber;
            downloaded: z.ZodNumber;
            existing: z.ZodNumber;
            failed: z.ZodNumber;
            totalSize: z.ZodNumber;
            reason: z.ZodEnum<{
                exhausted: "exhausted";
                incomplete: "incomplete";
                limit: "limit";
            }>;
            manifestPath: z.ZodString;
            startedAt: z.ZodNumber;
            finishedAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        fileCount: z.ZodOptional<z.ZodNumber>;
        downloadedCount: z.ZodOptional<z.ZodNumber>;
        skippedCount: z.ZodOptional<z.ZodNumber>;
        failedCount: z.ZodOptional<z.ZodNumber>;
        totalSize: z.ZodOptional<z.ZodNumber>;
        progress: z.ZodOptional<z.ZodObject<{
            percent: z.ZodNumber;
            indeterminate: z.ZodOptional<z.ZodBoolean>;
            currentSpeed: z.ZodOptional<z.ZodString>;
            eta: z.ZodOptional<z.ZodString>;
            downloaded: z.ZodOptional<z.ZodString>;
            total: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        error: z.ZodOptional<z.ZodString>;
        internalStatus: z.ZodOptional<z.ZodEnum<{
            cancelled: "cancelled";
            completed: "completed";
            failed: "failed";
            paused: "paused";
            processing: "processing";
            queued: "queued";
            "retry-scheduled": "retry-scheduled";
            running: "running";
        }>>;
        subStatus: z.ZodOptional<z.ZodEnum<{
            paused: "paused";
            queued: "queued";
            "retry-scheduled": "retry-scheduled";
        }>>;
        statusReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        errorCategory: z.ZodOptional<z.ZodEnum<{
            "auth-required": "auth-required";
            "binary-missing": "binary-missing";
            "cancelled-by-user": "cancelled-by-user";
            "disk-full": "disk-full";
            ffmpeg: "ffmpeg";
            "geo-blocked": "geo-blocked";
            "http-429": "http-429";
            "network-transient": "network-transient";
            "not-found": "not-found";
            "output-missing": "output-missing";
            "permission-denied": "permission-denied";
            stalled: "stalled";
            unknown: "unknown";
        }>>;
        uiMessageKey: z.ZodOptional<z.ZodString>;
        nextRetryAt: z.ZodOptional<z.ZodNumber>;
        attempt: z.ZodOptional<z.ZodNumber>;
        maxAttempts: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const VideoInfoOutputSchema: z.ZodObject<{
    video: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        thumbnail: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        extractorKey: z.ZodOptional<z.ZodString>;
        webpageUrl: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        viewCount: z.ZodOptional<z.ZodNumber>;
        uploader: z.ZodOptional<z.ZodString>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        formats: z.ZodArray<z.ZodObject<{
            formatId: z.ZodString;
            ext: z.ZodString;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
            fps: z.ZodOptional<z.ZodNumber>;
            vcodec: z.ZodOptional<z.ZodString>;
            acodec: z.ZodOptional<z.ZodString>;
            filesize: z.ZodOptional<z.ZodNumber>;
            filesizeApprox: z.ZodOptional<z.ZodNumber>;
            formatNote: z.ZodOptional<z.ZodString>;
            tbr: z.ZodOptional<z.ZodNumber>;
            quality: z.ZodOptional<z.ZodNumber>;
            protocol: z.ZodOptional<z.ZodString>;
            language: z.ZodOptional<z.ZodString>;
            videoExt: z.ZodOptional<z.ZodString>;
            audioExt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const PlaylistInfoOutputSchema: z.ZodObject<{
    playlist: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        entries: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            url: z.ZodURL;
            index: z.ZodNumber;
            thumbnail: z.ZodOptional<z.ZodString>;
            mediaKind: z.ZodOptional<z.ZodEnum<{
                photo: "photo";
                recording: "recording";
                video: "video";
            }>>;
        }, z.core.$strip>>;
        entryCount: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const PlaylistDownloadOutputSchema: z.ZodObject<{
    result: z.ZodObject<{
        groupId: z.ZodString;
        playlistId: z.ZodString;
        playlistTitle: z.ZodString;
        type: z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>;
        totalCount: z.ZodNumber;
        startIndex: z.ZodNumber;
        endIndex: z.ZodNumber;
        entries: z.ZodArray<z.ZodObject<{
            downloadId: z.ZodString;
            entryId: z.ZodString;
            title: z.ZodString;
            url: z.ZodURL;
            index: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const RemoveHistoryItemsInputSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const RemoveHistoryByPlaylistInputSchema: z.ZodObject<{
    playlistId: z.ZodString;
}, z.core.$strip>;
export declare const RemoveHistoryOutputSchema: z.ZodObject<{
    removed: z.ZodNumber;
}, z.core.$strip>;
export declare const FilePathInputSchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strip>;
export declare const DirectoryListInputSchema: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const UploadSettingsFileKindSchema: z.ZodEnum<{
    config: "config";
    cookies: "cookies";
}>;
export declare const UploadSettingsFileInputSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        config: "config";
        cookies: "cookies";
    }>;
    fileName: z.ZodString;
    content: z.ZodString;
}, z.core.$strip>;
export declare const FileExistsOutputSchema: z.ZodObject<{
    exists: z.ZodBoolean;
}, z.core.$strip>;
export declare const FileOperationOutputSchema: z.ZodObject<{
    success: z.ZodBoolean;
}, z.core.$strip>;
export declare const DirectoryEntrySchema: z.ZodObject<{
    name: z.ZodString;
    path: z.ZodString;
}, z.core.$strip>;
export declare const ListDirectoriesOutputSchema: z.ZodObject<{
    currentPath: z.ZodString;
    parentPath: z.ZodNullable<z.ZodString>;
    directories: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const UploadSettingsFileOutputSchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strip>;
export declare const GetWebSettingsOutputSchema: z.ZodObject<{
    settings: z.ZodObject<{
        downloadPath: z.ZodString;
        maxConcurrentDownloads: z.ZodNumber;
        browserForCookies: z.ZodString;
        cookiesPath: z.ZodString;
        proxy: z.ZodString;
        configPath: z.ZodString;
        language: z.ZodString;
        theme: z.ZodEnum<{
            dark: "dark";
            light: "light";
            system: "system";
        }>;
        oneClickDownload: z.ZodBoolean;
        oneClickDownloadType: z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>;
        oneClickQuality: z.ZodEnum<{
            bad: "bad";
            best: "best";
            good: "good";
            normal: "normal";
            worst: "worst";
        }>;
        oneClickContainer: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            mkv: "mkv";
            mp4: "mp4";
            original: "original";
            webm: "webm";
        }>>;
        closeToTray: z.ZodBoolean;
        subscriptionOnlyLatestDefault: z.ZodBoolean;
        downloadSubtitles: z.ZodDefault<z.ZodBoolean>;
        subtitleLanguages: z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>;
        embedSubs: z.ZodBoolean;
        writeAutoSubs: z.ZodDefault<z.ZodBoolean>;
        embedThumbnail: z.ZodBoolean;
        embedMetadata: z.ZodBoolean;
        embedChapters: z.ZodBoolean;
        filenameStyle: z.ZodDefault<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodDefault<z.ZodBoolean>;
        shareWatermark: z.ZodBoolean;
        downloadWithoutChannelSubfolders: z.ZodDefault<z.ZodBoolean>;
        downloadMirror: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
        enableDownloadNotifications: z.ZodDefault<z.ZodBoolean>;
        rememberLastAudioLanguage: z.ZodDefault<z.ZodBoolean>;
        preferredAudioLanguage: z.ZodDefault<z.ZodString>;
        autoTranscribeAfterDownload: z.ZodDefault<z.ZodBoolean>;
        maxConcurrentTranscriptions: z.ZodDefault<z.ZodNumber>;
        asrTier: z.ZodPreprocess<z.ZodDefault<z.ZodEnum<{
            balanced: "balanced";
            "fire-red-asr": "fire-red-asr";
            minimal: "minimal";
            orukeet: "orukeet";
            "parakeet-v2": "parakeet-v2";
            "parakeet-v3": "parakeet-v3";
            quality: "quality";
            "qwen3-1.7b": "qwen3-1.7b";
            "sense-voice": "sense-voice";
            "sense-voice-2025": "sense-voice-2025";
            "whisper-base": "whisper-base";
            "whisper-medium": "whisper-medium";
            "whisper-turbo": "whisper-turbo";
        }>>, unknown>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SetWebSettingsInputSchema: z.ZodObject<{
    settings: z.ZodObject<{
        downloadPath: z.ZodString;
        maxConcurrentDownloads: z.ZodNumber;
        browserForCookies: z.ZodString;
        cookiesPath: z.ZodString;
        proxy: z.ZodString;
        configPath: z.ZodString;
        language: z.ZodString;
        theme: z.ZodEnum<{
            dark: "dark";
            light: "light";
            system: "system";
        }>;
        oneClickDownload: z.ZodBoolean;
        oneClickDownloadType: z.ZodEnum<{
            audio: "audio";
            video: "video";
        }>;
        oneClickQuality: z.ZodEnum<{
            bad: "bad";
            best: "best";
            good: "good";
            normal: "normal";
            worst: "worst";
        }>;
        oneClickContainer: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            mkv: "mkv";
            mp4: "mp4";
            original: "original";
            webm: "webm";
        }>>;
        closeToTray: z.ZodBoolean;
        subscriptionOnlyLatestDefault: z.ZodBoolean;
        downloadSubtitles: z.ZodDefault<z.ZodBoolean>;
        subtitleLanguages: z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>;
        embedSubs: z.ZodBoolean;
        writeAutoSubs: z.ZodDefault<z.ZodBoolean>;
        embedThumbnail: z.ZodBoolean;
        embedMetadata: z.ZodBoolean;
        embedChapters: z.ZodBoolean;
        filenameStyle: z.ZodDefault<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodDefault<z.ZodBoolean>;
        shareWatermark: z.ZodBoolean;
        downloadWithoutChannelSubfolders: z.ZodDefault<z.ZodBoolean>;
        downloadMirror: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
        enableDownloadNotifications: z.ZodDefault<z.ZodBoolean>;
        rememberLastAudioLanguage: z.ZodDefault<z.ZodBoolean>;
        preferredAudioLanguage: z.ZodDefault<z.ZodString>;
        autoTranscribeAfterDownload: z.ZodDefault<z.ZodBoolean>;
        maxConcurrentTranscriptions: z.ZodDefault<z.ZodNumber>;
        asrTier: z.ZodPreprocess<z.ZodDefault<z.ZodEnum<{
            balanced: "balanced";
            "fire-red-asr": "fire-red-asr";
            minimal: "minimal";
            orukeet: "orukeet";
            "parakeet-v2": "parakeet-v2";
            "parakeet-v3": "parakeet-v3";
            quality: "quality";
            "qwen3-1.7b": "qwen3-1.7b";
            "sense-voice": "sense-voice";
            "sense-voice-2025": "sense-voice-2025";
            "whisper-base": "whisper-base";
            "whisper-medium": "whisper-medium";
            "whisper-turbo": "whisper-turbo";
        }>>, unknown>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SocialMediaInspectInputSchema: z.ZodObject<{
    url: z.ZodURL;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SocialMediaInspectOutputSchema: z.ZodObject<{
    source: z.ZodObject<{
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
    preview: z.ZodObject<{
        posts: z.ZodNumber;
        images: z.ZodNumber;
        videos: z.ZodNumber;
        limited: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SocialMediaDownloadInputSchema: z.ZodObject<{
    url: z.ZodURL;
    categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
    options: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
    customDownloadPath: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        downloadPath: z.ZodOptional<z.ZodString>;
        browserForCookies: z.ZodOptional<z.ZodString>;
        cookiesPath: z.ZodOptional<z.ZodString>;
        proxy: z.ZodOptional<z.ZodString>;
        configPath: z.ZodOptional<z.ZodString>;
        downloadSubtitles: z.ZodOptional<z.ZodBoolean>;
        subtitleLanguages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        interfaceLanguage: z.ZodOptional<z.ZodString>;
        embedSubs: z.ZodOptional<z.ZodBoolean>;
        writeAutoSubs: z.ZodOptional<z.ZodBoolean>;
        embedThumbnail: z.ZodOptional<z.ZodBoolean>;
        embedMetadata: z.ZodOptional<z.ZodBoolean>;
        embedChapters: z.ZodOptional<z.ZodBoolean>;
        filenameStyle: z.ZodOptional<z.ZodEnum<{
            basic: "basic";
            classic: "classic";
            nerdy: "nerdy";
            pretty: "pretty";
        }>>;
        filenameViaVidBee: z.ZodOptional<z.ZodBoolean>;
        shareWatermark: z.ZodOptional<z.ZodBoolean>;
        downloadWithoutChannelSubfolders: z.ZodOptional<z.ZodBoolean>;
        downloadMirror: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            cn: "cn";
            global: "global";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SocialMediaDownloadOutputSchema: z.ZodObject<{
    groupId: z.ZodString;
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const InstagramProfileCancelInputSchema: z.ZodObject<{
    url: z.ZodURL;
}, z.core.$strip>;
export declare const InstagramProfileCancelOutputSchema: z.ZodObject<{
    cancelled: z.ZodBoolean;
}, z.core.$strip>;
export declare const InstagramProfileListOutputSchema: z.ZodObject<{
    profiles: z.ZodArray<z.ZodObject<{
        mapping: z.ZodOptional<z.ZodObject<{
            category: z.ZodEnum<{
                highlights: "highlights";
                posts: "posts";
                reels: "reels";
                stories: "stories";
                tagged: "tagged";
            }>;
            state: z.ZodEnum<{
                queued: "queued";
                running: "running";
            }>;
        }, z.core.$strip>>;
        inspectionId: z.ZodString;
        profile: z.ZodObject<{
            username: z.ZodString;
            profileUrl: z.ZodURL;
            displayName: z.ZodOptional<z.ZodString>;
            avatarUrl: z.ZodOptional<z.ZodURL>;
            isPrivate: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        totalSourceCount: z.ZodNumber;
        totalAssetCount: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
