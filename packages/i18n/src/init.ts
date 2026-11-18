import * as Effect from "effect/Effect";
import { I18nInitializer } from "./I18n.service.js";
import { defaultLanguageCode, supportedLanguageCodes } from "./languages.js";
import { translationResources } from "./resources.js";
import type { i18n as I18nInstance, InitOptions, ThirdPartyModule } from "i18next";
/**
 * Build the shared i18next options (resources, default/fallback language).
 */
export const createI18nOptions = (): InitOptions => ({
  resources: translationResources,
  lng: defaultLanguageCode,
  fallbackLng: defaultLanguageCode,
  supportedLngs: supportedLanguageCodes,
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Initialize with the consuming app's own react-i18next binding, so setI18n and
 * useTranslation share that app's module state. Never import its runtime here.
 */
export const initSharedI18n = Effect.fn("i18n.initSharedI18n")(function* (
  instance: I18nInstance,
  reactBinding: ThirdPartyModule
) {
  const initializer = yield* I18nInitializer;
  return yield* initializer.initialize(instance, reactBinding);
});
