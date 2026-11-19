import { dual } from "effect/Function";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as Str from "effect/String";
export const FOLLOW_INTERFACE_SUBTITLE_LANGUAGE = "interface";
export const MAX_SUBTITLE_LANGUAGES = 5;
export const DEFAULT_SUBTITLE_LANGUAGES = [FOLLOW_INTERFACE_SUBTITLE_LANGUAGE] as const;

const SUBTITLE_LANGUAGE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

const SUBTITLE_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["ar-SA", "ar_SA", "ara"],
  de: ["de-DE", "de_DE", "deu", "ger"],
  en: ["en-US", "en_US", "en-GB", "en_GB", "eng"],
  es: ["es-ES", "es_ES", "es-419", "es_419", "spa"],
  fr: ["fr-FR", "fr_FR", "fra", "fre"],
  id: ["id-ID", "id_ID", "ind"],
  it: ["it-IT", "it_IT", "ita"],
  ja: ["ja-JP", "ja_JP", "jpn"],
  ko: ["ko-KR", "ko_KR", "kor"],
  pt: ["pt-BR", "pt_BR", "pt-PT", "pt_PT", "por"],
  ru: ["ru-RU", "ru_RU", "rus"],
  tr: ["tr-TR", "tr_TR", "tur"],
  "zh-hans": ["zh", "zh-CN", "zh_CN", "zho", "chi"],
  "zh-hant": ["zh-TW", "zh_TW", "zh-HK", "zh_HK"],
};

/**
 * Convert an app locale into the closest subtitle language code used by yt-dlp.
 *
 * @param language VidBee locale or explicit subtitle language.
 * @returns A normalized subtitle language code.
 */
export const interfaceSubtitleLanguage = (language: string | null | undefined): string => {
  const normalized =
    Str.replaceAll("_", "-")(language === undefined || language === null ? "" : Str.trim(language)) || "en";
  const lower = Str.toLowerCase(normalized);

  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower === "zh-hant") {
    return "zh-Hant";
  }
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-sg" || lower === "zh-hans") {
    return "zh-Hans";
  }

  return normalized;
};

/**
 * Sanitize persisted subtitle preferences and keep request volume bounded.
 *
 * @param languages Persisted language codes or the interface-language token.
 * @returns Valid, de-duplicated preferences with a safe default.
 */
export const normalizeSubtitleLanguages = (languages: readonly string[] | null | undefined): string[] => {
  const normalized: string[] = [];
  const seen = MutableHashSet.empty<string>();

  for (const language of languages ?? []) {
    const trimmed = Str.trim(language);
    const isInterfaceLanguage = trimmed === FOLLOW_INTERFACE_SUBTITLE_LANGUAGE;
    const isReservedAllPattern = Str.toLowerCase(trimmed) === "all";
    if (isReservedAllPattern || !(isInterfaceLanguage || SUBTITLE_LANGUAGE_CODE.test(trimmed))) {
      continue;
    }

    const key = Str.toLowerCase(trimmed);
    if (MutableHashSet.has(seen, key)) {
      continue;
    }
    MutableHashSet.add(seen, key);
    normalized.push(trimmed);

    if (normalized.length >= MAX_SUBTITLE_LANGUAGES) {
      break;
    }
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_SUBTITLE_LANGUAGES];
};

/**
 * Resolve dynamic preferences into exact yt-dlp subtitle language codes.
 *
 * @param languages Persisted subtitle language preferences.
 * @param interfaceLanguage Current VidBee interface language.
 * @returns Exact language codes, de-duplicated after interface-language expansion.
 */
const resolveSubtitleLanguagesDataFirst = (
  languages: readonly string[] | null | undefined,
  interfaceLanguage: string | null | undefined
): string[] => {
  const resolved: string[] = [];
  const seen = MutableHashSet.empty<string>();

  for (const preference of normalizeSubtitleLanguages(languages)) {
    const language = interfaceSubtitleLanguage(
      preference === FOLLOW_INTERFACE_SUBTITLE_LANGUAGE ? interfaceLanguage : preference
    );
    const key = Str.toLowerCase(language);
    if (MutableHashSet.has(seen, key)) {
      continue;
    }
    MutableHashSet.add(seen, key);
    resolved.push(language);
  }

  return resolved;
};

export const resolveSubtitleLanguages: {
  (interfaceLanguage: string | null | undefined): (languages: readonly string[] | null | undefined) => string[];
  (languages: readonly string[] | null | undefined, interfaceLanguage: string | null | undefined): string[];
} = dual(2, resolveSubtitleLanguagesDataFirst);

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
export const expandSubtitleLanguageAliases = (languages: readonly string[]): string[] => {
  const expanded: string[] = [];
  const indexes = MutableHashMap.empty<string, number>();
  const put = (key: string, value: string): void => {
    const index = MutableHashMap.get(indexes, key);
    if (Option.isSome(index)) expanded[index.value] = value;
    else {
      MutableHashMap.set(indexes, key, expanded.length);
      expanded.push(value);
    }
  };

  for (const language of languages) {
    put(Str.toLowerCase(language), language);
    const key = Str.toLowerCase(Str.replaceAll("_", "-")(Str.trim(language)));
    const aliasKey = Str.startsWith("zh-")(key) ? key : (Str.split(key, "-")[0] ?? key);
    for (const alias of SUBTITLE_LANGUAGE_ALIASES[aliasKey] ?? []) {
      put(Str.toLowerCase(alias), alias);
    }
  }

  return expanded;
};

/** Plain implementations for internal data-first calls. */
export const DataFirst = {
  resolveSubtitleLanguages: resolveSubtitleLanguagesDataFirst,
};
