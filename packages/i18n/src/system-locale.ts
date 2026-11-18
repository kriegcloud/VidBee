import * as A from "effect/Array";
import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import * as Str from "effect/String";
import { defaultLanguageCode } from "./languages.js";
import type { LanguageCode, SystemProfile, SystemProfileHints } from "./I18n.model.js";

export { SystemProfile, SystemProfileHints, SystemProfileInput } from "./I18n.model.js";

const MAINLAND_TIME_ZONES = HashSet.fromIterable([
  "Asia/Shanghai",
  "Asia/Chongqing",
  "Asia/Urumqi",
  "Asia/Harbin",
  "Asia/Kashgar",
  "Asia/Urumchi",
]);

const TIME_ZONE_LANGUAGE: Readonly<Record<string, LanguageCode>> = {
  "Asia/Shanghai": "zh",
  "Asia/Chongqing": "zh",
  "Asia/Urumqi": "zh",
  "Asia/Harbin": "zh",
  "Asia/Kashgar": "zh",
  "Asia/Urumchi": "zh",
  "Asia/Taipei": "zh-TW",
  "Asia/Hong_Kong": "zh-TW",
  "Asia/Macau": "zh-TW",
  "Asia/Tokyo": "ja",
  "Asia/Seoul": "ko",
  "Europe/Berlin": "de",
  "Europe/Paris": "fr",
  "Europe/Rome": "it",
  "Europe/Madrid": "es",
  "Europe/Moscow": "ru",
  "Europe/Istanbul": "tr",
  "America/Sao_Paulo": "pt",
  "Asia/Jakarta": "id",
  "Asia/Riyadh": "ar",
};

const COUNTRY_LANGUAGE: Readonly<Record<string, LanguageCode>> = {
  CN: "zh",
  SG: "zh",
  TW: "zh-TW",
  HK: "zh-TW",
  MO: "zh-TW",
  JP: "ja",
  KR: "ko",
  DE: "de",
  FR: "fr",
  IT: "it",
  ES: "es",
  BR: "pt",
  PT: "pt",
  RU: "ru",
  TR: "tr",
  ID: "id",
  SA: "ar",
  AE: "ar",
};

const BASE_LANGUAGE: Readonly<Record<string, LanguageCode>> = {
  ar: "ar",
  de: "de",
  en: "en",
  es: "es",
  fr: "fr",
  id: "id",
  it: "it",
  ja: "ja",
  ko: "ko",
  pt: "pt",
  ru: "ru",
  tr: "tr",
  zh: "zh",
};

/**
 * Map one OS/BCP-47 tag onto a supported UI language, or null if unknown.
 */
export const languageFromTag = (tag: string | null | undefined): LanguageCode | null => {
  if (tag === null || tag === undefined || tag === "") {
    return null;
  }
  const cleaned = Str.split(Str.toLowerCase(Str.replaceAll("_", "-")(Str.trim(tag))), ".")[0];
  if (cleaned === "" || cleaned === "c" || cleaned === "posix") {
    return null;
  }
  const [base = "", region = ""] = Str.split(cleaned, "-");
  if (base === "zh") {
    return ["hant", "tw", "hk", "mo"].includes(region) ? "zh-TW" : "zh";
  }
  return BASE_LANGUAGE[base] ?? null;
};

/**
 * True when a locale tag is mainland / simplified Chinese, not TW/HK/MO.
 */
export const isMainlandChineseLocale = (tag: string | null | undefined): boolean => {
  const language = languageFromTag(tag);
  if (language !== "zh") {
    return false;
  }
  const region = Str.split(Str.toLowerCase(Str.replaceAll("_", "-")(Str.trim(tag ?? ""))), /[.-]/)[1] ?? "";
  return !["hant", "tw", "hk", "mo"].includes(region);
};

/**
 * Infer UI language and China-mirror preference from OS language, timezone, and country.
 *
 * A specific non-English system language wins. English or unknown language falls
 * through to timezone, then country. `VIDBEE_LANGUAGE` pins only the UI language.
 */
export const detectSystemProfile = (input: SystemProfileHints): SystemProfile => {
  const env = input.env ?? {};
  const timeZone = input.timeZone ?? "";
  const country = Str.toUpperCase(Str.trim(input.countryCode ?? ""));
  const hostLocales =
    input.locales !== undefined && input.locales.length > 0
      ? input.locales
      : [env.LANG, env.LC_ALL, env.LC_MESSAGES, input.defaultLocale ?? ""];
  const locales = [env.VIDBEE_LANGUAGE, ...hostLocales];
  const primaryTag = O.getOrUndefined(A.findFirst(locales, (tag) => languageFromTag(tag) !== null));
  const primaryLanguage = languageFromTag(primaryTag);
  const forcedLanguage = languageFromTag(env.VIDBEE_LANGUAGE);
  const tzLanguage = TIME_ZONE_LANGUAGE[timeZone];
  const countryLanguage = country !== "" ? COUNTRY_LANGUAGE[country] : undefined;
  const language =
    forcedLanguage ??
    (primaryLanguage !== null && primaryLanguage !== "en"
      ? primaryLanguage
      : (tzLanguage ?? countryLanguage ?? primaryLanguage ?? defaultLanguageCode));
  const preferChina =
    HashSet.has(MAINLAND_TIME_ZONES, timeZone) || isMainlandChineseLocale(primaryTag) || country === "CN";
  return { language, preferChina };
};
