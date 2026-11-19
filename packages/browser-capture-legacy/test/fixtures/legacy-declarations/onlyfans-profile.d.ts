// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
import { isOnlyFansSite, type OnlyFansChatRoute, type OnlyFansCommand, type OnlyFansDownload, type OnlyFansItem, type OnlyFansProfile, onlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile';
import { type Executor, type ExecutorContext, type ExecutorEvents, type ExecutorRun, type TaskQueueAPI } from '@vidbee/task-queue-legacy';
/** Only signed media URLs from the site's CDN are eligible; never send account cookies. */
export declare function onlyFansMediaUrl(value: unknown): string | null;
/** Extract references only. Signed CDN URLs live in memory and are not saved in profiles. */
export declare function onlyFansItems(payload: unknown): {
    item: OnlyFansItem;
    mediaUrl: string | null;
}[];
export interface ChatVideoAttachment {
    id: string;
    postId: string;
    state: OnlyFansItem['state'];
    durationSec: number | null;
    previewPath: string | null;
}
/**
 * Videos in the order `onlyFansItems` walks a chat message payload.
 * Photos and other attachments are skipped and do not shift the index.
 */
export declare function chatVideoAttachments(payload: unknown): ChatVideoAttachment[];
/** 1-based video index in message-list order. A missing index is null, not a later video. */
export declare function chatVideoByOrdinal(payload: unknown, ordinal: number): ChatVideoAttachment | null;
/** Match only the selected conversation, never the chat list or another conversation. */
export declare function onlyFansChatResponse(url: URL, chatId: string): boolean;
export declare function onlyFansChatMediaResponse(url: URL, chatId: string, route?: OnlyFansChatRoute): boolean;
export declare function onlyFansPurchasedResponse(url: URL, userId: string): boolean;
export interface BrowserProfileAdapter {
    name: string;
    key: string;
    origin: string;
    normalize: typeof onlyFansProfile;
    isSite: typeof isOnlyFansSite;
    items: typeof onlyFansItems;
    ownerResponse: (url: URL, username: string) => boolean;
    ownerId: (payload: unknown, username: string) => string | null;
    feedResponse: (url: URL, ownerId: string, profile: OnlyFansProfile) => boolean;
    complete: (payload: unknown) => boolean;
    queueUrl: (item: OnlyFansItem, profile: OnlyFansProfile) => string;
    refreshUrl: (item: OnlyFansItem, profile: OnlyFansProfile) => string;
    refreshResponse: (url: URL, item: OnlyFansItem, profile: OnlyFansProfile) => boolean;
    scrollMode: (profile: OnlyFansProfile) => {
        nested: boolean;
        chat: boolean;
    };
    requiresCookies: boolean;
}
export declare class OnlyFansProfiles {
    private loginBrowser;
    private context;
    private opening;
    private page;
    private active;
    private downloading;
    private readonly profiles;
    private readonly media;
    readonly adapter: BrowserProfileAdapter;
    private readonly storageDir;
    private readonly defaultDownloadDir;
    constructor(storageDir: string, defaultDownloadDir: () => string, adapter?: BrowserProfileAdapter);
    private key;
    private profileKey;
    private save;
    private linkChatCreatorUsername;
    private linkChatCreator;
    get(url: string): OnlyFansProfile;
    list(): OnlyFansProfile[];
    private browser;
    private browserPage;
    command(raw: OnlyFansCommand): Promise<OnlyFansProfile>;
    private collect;
    private map;
    enqueue(queue: TaskQueueAPI, raw: OnlyFansDownload): Promise<{
        count: number;
    }>;
    download(profileUrl: string, mediaId: string, destination: string, signal: AbortSignal, progress: (bytes: number, total: number) => void): Promise<{
        filePath: string;
        size: number;
    }>;
    private openCoveredMedia;
    stop(): Promise<void>;
}
/** Route OnlyFans ahead of yt-dlp, including old queued URLs, so Chrome cookies never leave Chrome. */
export declare class OnlyFansBrowserExecutor implements Executor {
    private readonly profiles;
    private readonly fallback;
    private readonly defaultDirectory;
    constructor(profiles: OnlyFansProfiles, fallback: Executor, defaultDirectory: () => string);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
}
