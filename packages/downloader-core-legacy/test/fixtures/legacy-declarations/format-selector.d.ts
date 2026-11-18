/**
 * Shared yt-dlp format-id selector used by Desktop and Web download dialogs.
 *
 * A single-format pick must degrade to best-available instead of hard-failing
 * with "Requested format is not available". Some sites list premium tiers
 * when cookies are present even for accounts that cannot fetch them.
 */
export interface FormatSelectorInput {
    vcodec?: string;
    acodec?: string;
    ext?: string;
}
export declare const SINGLE_FORMAT_FALLBACK = "bestvideo+bestaudio/best";
export declare const isMuxedVideoFormat: (format: FormatSelectorInput | undefined) => boolean;
export declare const resolvePreferredAudioExt: (videoExt: string | undefined) => string | undefined;
export declare const buildSingleVideoFormatSelector: (formatId: string, format: FormatSelectorInput | undefined) => string;
