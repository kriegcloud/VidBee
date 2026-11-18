export declare const FOLLOW_INTERFACE_SUBTITLE_LANGUAGE = "interface";
export declare const MAX_SUBTITLE_LANGUAGES = 5;
export declare const DEFAULT_SUBTITLE_LANGUAGES: readonly ["interface"];
/**
 * Convert an app locale into the closest subtitle language code used by yt-dlp.
 *
 * @param language VidBee locale or explicit subtitle language.
 * @returns A normalized subtitle language code.
 */
export declare const interfaceSubtitleLanguage: (language: string | null | undefined) => string;
/**
 * Sanitize persisted subtitle preferences and keep request volume bounded.
 *
 * @param languages Persisted language codes or the interface-language token.
 * @returns Valid, de-duplicated preferences with a safe default.
 */
export declare const normalizeSubtitleLanguages: (languages: readonly string[] | null | undefined) => string[];
/**
 * Resolve dynamic preferences into exact yt-dlp subtitle language codes.
 *
 * @param languages Persisted subtitle language preferences.
 * @param interfaceLanguage Current VidBee interface language.
 * @returns Exact language codes, de-duplicated after interface-language expansion.
 */
export declare const resolveSubtitleLanguages: (languages: readonly string[] | null | undefined, interfaceLanguage: string | null | undefined) => string[];
/**
 * Expand canonical preferences into common extractor-specific subtitle tags.
 *
 * Platforms frequently expose locale (`en_US`), regional (`pt-BR`), or ISO-639-2
 * (`eng`) tags instead of VidBee's canonical language code. Exact aliases keep
 * matching bounded without using broad regexes that may download duplicate tracks.
 *
 * @param languages Canonical subtitle language codes.
 * @returns De-duplicated canonical codes followed by known platform aliases.
 */
export declare const expandSubtitleLanguageAliases: (languages: readonly string[]) => string[];
