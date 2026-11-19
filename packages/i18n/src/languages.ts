import * as A from "effect/Array";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as Str from "effect/String";
import type { LanguageCode, LanguageDefinition } from "./I18n.model.js";
export const languages = {
  en: {
    name: "English",
    hreflang: "en",
  },
  es: {
    name: "Español",
    hreflang: "es",
  },
  ar: {
    name: "العربية",
    hreflang: "ar",
  },
  id: {
    name: "Bahasa Indonesia",
    hreflang: "id",
  },
  pt: {
    name: "Português",
    hreflang: "pt-BR",
  },
  fr: {
    name: "Français",
    hreflang: "fr",
  },
  it: {
    name: "Italiano",
    hreflang: "it",
  },
  zh: {
    name: "中文",
    hreflang: "zh-CN",
  },
  "zh-TW": {
    name: "繁體中文",
    hreflang: "zh-TW",
  },
  ko: {
    name: "한국어",
    hreflang: "ko",
  },
  ja: {
    name: "日本語",
    hreflang: "ja",
  },
  ru: {
    name: "Русский",
    hreflang: "ru",
  },
  tr: {
    name: "Türkçe",
    hreflang: "tr",
  },
  de: {
    name: "Deutsch",
    hreflang: "de",
  },
} as const satisfies Record<string, LanguageDefinition>;

export { LanguageCode, LanguageDefinition } from "./I18n.model.js";

export const defaultLanguageCode: LanguageCode = "en";

export const languageList = A.map(R.toEntries(languages), ([code, definition]) => ({
  value: code,
  ...definition,
}));

export const supportedLanguageCodes = A.map(languageList, (language) => language.value);

export function normalizeLanguageCode(code: string | null | undefined): LanguageCode {
  if (!P.isTruthy(code) || code == null) return defaultLanguageCode;
  const normalizedInput = Str.toLowerCase(code);
  const directMatch = O.getOrUndefined(
    A.findFirst(supportedLanguageCodes, (languageCode) => Str.toLowerCase(languageCode) === normalizedInput)
  );
  if (directMatch !== undefined) return directMatch;
  const base = Str.split(normalizedInput, "-")[0];
  return (
    O.getOrUndefined(
      A.findFirst(supportedLanguageCodes, (languageCode) => Str.toLowerCase(Str.split(languageCode, "-")[0]) === base)
    ) ?? defaultLanguageCode
  );
}
