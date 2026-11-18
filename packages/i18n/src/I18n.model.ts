import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const LanguageCode = LiteralKit([
  "en",
  "es",
  "ar",
  "id",
  "pt",
  "fr",
  "it",
  "zh",
  "zh-TW",
  "ko",
  "ja",
  "ru",
  "tr",
  "de",
]);
export type LanguageCode = typeof LanguageCode.Type;
export const LanguageDefinition = S.Struct({ name: S.String, hreflang: S.String });
export type LanguageDefinition = typeof LanguageDefinition.Type;
export const SystemProfileInput = S.Struct({
  countryCode: S.String.pipe(S.UndefinedOr, S.optionalKey),
  env: S.Record(S.String, S.UndefinedOr(S.String)).pipe(S.UndefinedOr, S.optionalKey),
  locales: S.Array(S.String).pipe(S.UndefinedOr, S.optionalKey),
  timeZone: S.String.pipe(S.UndefinedOr, S.optionalKey),
});
export type SystemProfileInput = typeof SystemProfileInput.Type;
export const SystemProfileHints = S.Struct({
  ...SystemProfileInput.fields,
  defaultLocale: S.optionalKey(S.String),
});
export type SystemProfileHints = typeof SystemProfileHints.Type;
export const SystemProfile = S.Struct({ language: LanguageCode, preferChina: S.Boolean });
export type SystemProfile = typeof SystemProfile.Type;

export interface TranslationObject {
  readonly [key: string]: string | TranslationObject;
}
export const TranslationDictionary: S.Codec<TranslationObject> = S.Record(
  S.String,
  S.Union([S.String, S.suspend(() => TranslationDictionary)])
);
export const I18nOptions = S.Struct({
  resources: S.Record(LanguageCode, S.Struct({ translation: TranslationDictionary })),
  lng: LanguageCode,
  fallbackLng: LanguageCode,
  supportedLngs: S.Array(LanguageCode),
  interpolation: S.Struct({ escapeValue: S.Boolean }),
});
