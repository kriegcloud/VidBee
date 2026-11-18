import type { DownloadCookieSource } from '@vidbee/task-queue-legacy';
import { type FilenameStyle } from './filename-style';
import type { OneClickContainerOption } from './format-preferences';
import type { DownloadRuntimeSettings } from './types';
export interface YtDlpDownloadSettings {
    downloadPath?: string;
    browserForCookies?: string;
    cookiesPath?: string;
    proxy?: string;
    configPath?: string;
    downloadSubtitles?: boolean;
    subtitleLanguages?: string[];
    interfaceLanguage?: string;
    embedSubs?: boolean;
    writeAutoSubs?: boolean;
    embedThumbnail?: boolean;
    embedMetadata?: boolean;
    embedChapters?: boolean;
    filenameStyle?: FilenameStyle;
    filenameViaVidBee?: boolean;
    shareWatermark?: boolean;
}
export interface YtDlpDownloadOptions {
    url: string;
    type: 'video' | 'audio';
    format?: string;
    audioFormat?: string;
    audioFormatIds?: string[];
    startTime?: string;
    endTime?: string;
    customDownloadPath?: string;
    customFilenameTemplate?: string;
    containerFormat?: OneClickContainerOption;
}
export declare const VIDBEE_OUTPUT_PATH_PREFIX = "__VIDBEE_OUTPUT_PATH__:";
/**
 * Resolve canonical, regional, and Bilibili AI subtitle language tags.
 *
 * yt-dlp exposes Bilibili AI captions as regular subtitle tracks such as `ai-zh`,
 * so `--write-auto-subs` alone cannot select them. Common extractor aliases are
 * always included; Bilibili AI aliases are added only while automatic captions are on.
 */
export declare const resolveDownloadSubtitleLanguages: (languages: readonly string[], url: string, writeAutoSubs: boolean) => string[];
export declare const METADATA_NETWORK_ATTEMPTS = 3;
export declare const METADATA_NETWORK_RETRY_DELAY_MS = 1000;
/**
 * Return whether a yt-dlp failure is a truncated or timed-out HTTP read.
 *
 * Extractor webpage/JSON reads do not honor `--retries`. IncompleteRead and
 * read timeouts therefore fail a `-j` probe unless the whole process is retried.
 */
export declare const isTransientYtDlpNetworkError: (error: string) => boolean;
/**
 * Retry a yt-dlp metadata probe when the site truncates or times out the HTTP body.
 */
export declare const retryTransientYtDlpNetworkError: <T>(run: () => Promise<T>, sleep?: (ms: number) => Promise<void>) => Promise<T>;
/** Convert a seconds, MM:SS, or HH:MM:SS timecode to seconds. */
export declare const parseDownloadTimecode: (value: string) => number | null;
/** Validate optional time-range values before passing them to yt-dlp. */
export declare const validateDownloadTimeRange: (startTime?: string, endTime?: string) => void;
/**
 * Return whether a URL points at a single DASH media segment instead of a
 * page or manifest that yt-dlp can resolve into a complete download.
 */
export declare const isDirectMediaSegmentUrl: (value: string) => boolean;
/** Reject bare media-segment URLs with guidance that is useful in every host. */
export declare const assertDownloadSourceUrl: (value: string) => void;
/**
 * Normalize browser cookies settings before passing them to yt-dlp.
 *
 * Issue refs: #331, #337, #341.
 */
export declare const normalizeBrowserCookiesSettingForYtDlp: (value?: string | null) => string;
export type SubtitleDownloadSkipReason = 'auth-required' | 'automatic-captions-disabled';
/**
 * Explain why a requested video subtitle download must be skipped before yt-dlp starts.
 *
 * @param options Download source and media type.
 * @param settings Effective runtime subtitle and authentication settings.
 * @returns A stable skip reason, or null when subtitle arguments should be emitted.
 */
export declare const resolveSubtitleDownloadSkipReason: (options: Pick<YtDlpDownloadOptions, 'type' | 'url'>, settings: YtDlpDownloadSettings) => SubtitleDownloadSkipReason | null;
export declare const resolvePathWithHome: (rawPath?: string | null) => string | undefined;
export declare const sanitizeFilenameTemplate: (template: string, fallbackTemplate?: string) => string;
/**
 * Appends platform-specific filename safety flags.
 */
export declare const appendPlatformFilenameSafetyArgs: (args: string[], platform?: NodeJS.Platform) => void;
export declare const isYouTubeUrl: (url: string) => boolean;
export declare const appendYouTubeSafeExtractorArgs: (args: string[], url: string) => void;
export declare const formatYtDlpCommand: (args: string[]) => string;
export declare const resolveFfmpegLocationFromPath: (ffmpegPath: string) => string;
export declare const resolveVideoFormatSelector: (options: YtDlpDownloadOptions) => string;
export declare const THUMBNAIL_EMBED_UNSUPPORTED_LOG = "[VidBeep] Thumbnail embedding is unsupported for this container. The video was saved. Choose MP4 or MKV to embed cover art.";
/**
 * Thumbnail flags for one download.
 *
 * WebM cannot store cover art. `--embed-thumbnail` makes yt-dlp fail the
 * download after the video is saved (GitHub issue #467). Write a separate
 * thumbnail file instead. MP4, MKV, and Auto still embed the cover.
 */
export declare const resolveThumbnailDownloadArgs: (type: YtDlpDownloadOptions['type'], container: OneClickContainerOption | undefined, embedThumbnail: boolean) => string[];
/**
 * Return whether yt-dlp failed only because cover art cannot be embedded.
 *
 * Other ERROR lines still fail the download. Callers must also confirm a
 * non-empty media file exists before treating the run as successful.
 */
export declare const isUnsupportedThumbnailEmbedOnlyFailure: (output: string) => boolean;
export declare const resolveAudioFormatSelector: (options: YtDlpDownloadOptions) => string;
export declare const buildDownloadArgs: (options: YtDlpDownloadOptions, fallbackDownloadPath: string, settings: YtDlpDownloadSettings, jsRuntimeArgs?: string[]) => string[];
export declare const buildVideoInfoArgs: (url: string, settings: YtDlpDownloadSettings, jsRuntimeArgs?: string[]) => string[];
/**
 * Build a skip-download yt-dlp argv that writes caption sidecars next to an info JSON.
 *
 * @param url Watch URL.
 * @param outputTemplate yt-dlp `-o` template without an extension.
 * @param settings Host cookies, proxy, and config.
 * @param jsRuntimeArgs Active Desktop JS runtime flags.
 * @param subtitleLanguages Canonical subtitle languages; an empty list requests all tracks.
 */
export declare const buildCaptionExtractArgs: (url: string, outputTemplate: string, settings: YtDlpDownloadSettings, jsRuntimeArgs?: string[], subtitleLanguages?: readonly string[]) => string[];
export declare const buildPlaylistInfoArgs: (url: string, settings: YtDlpDownloadSettings, jsRuntimeArgs?: string[]) => string[];
/** Capture explicit cookie sources from the executed arguments without retaining credentials. */
export declare function cookieSourcesFromArgs(args: readonly string[], settings: DownloadRuntimeSettings): DownloadCookieSource[];
