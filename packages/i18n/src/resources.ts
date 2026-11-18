import * as A from "effect/Array";
import * as R from "effect/Record";
import { supportedLanguageCodes } from "./languages.js";
import ar from "./locales/ar.json" with { type: "json" };
import de from "./locales/de.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import id from "./locales/id.json" with { type: "json" };
import it from "./locales/it.json" with { type: "json" };
import ja from "./locales/ja.json" with { type: "json" };
import ko from "./locales/ko.json" with { type: "json" };
import pt from "./locales/pt.json" with { type: "json" };
import ru from "./locales/ru.json" with { type: "json" };
import tr from "./locales/tr.json" with { type: "json" };
import zh from "./locales/zh.json" with { type: "json" };
import zhTw from "./locales/zh-TW.json" with { type: "json" };
import type { Resource } from "i18next";
import type { LanguageCode } from "./languages.js";

export type TranslationDictionary = typeof en;

const translationDictionaries: Record<LanguageCode, TranslationDictionary> = {
  ar,
  de,
  en,
  es,
  fr,
  id,
  it,
  ja,
  ko,
  pt,
  ru,
  tr,
  "zh-TW": zhTw,
  zh,
};

export const translationResources: Resource = R.fromEntries(
  A.map(
    supportedLanguageCodes,
    (code) =>
      [
        code,
        {
          translation: translationDictionaries[code] ?? en,
        },
      ] as const
  )
);
