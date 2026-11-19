// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
/**
 * Chat captures keep the conversation URL, including `firstId`.
 * Other pages still drop media suffixes so the player can open them.
 */
export declare const capturePageUrl: (value: string, videoOrdinal?: number) => string;
/** Strip site-specific media suffixes so the player opens the watchable page. */
export declare const playbackPageUrl: (value: string) => string;
export declare const DRM_FALLBACK_MESSAGE = "[VidBeep] Source is DRM protected; recording in-browser playback on a virtual display.";
/** True when a yt-dlp finish event is the expected CDM/DRM failure. */
export declare const isDrmProtectedMessage: (text: string) => boolean;
