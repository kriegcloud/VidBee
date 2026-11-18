export { I18nInitializerLive } from "./I18n.driver.js";
export { I18nInitializationError } from "./I18n.errors.js";
export {
  I18nOptions,
  SystemProfile,
  SystemProfileHints,
  SystemProfileInput,
  TranslationDictionary as TranslationDictionarySchema,
} from "./I18n.model.js";
export { I18nInitializer } from "./I18n.service.js";
export { createI18nOptions, initSharedI18n } from "./init.js";
export {
  defaultLanguageCode,
  LanguageCode,
  LanguageDefinition,
  languageList,
  languages,
  normalizeLanguageCode,
  supportedLanguageCodes,
} from "./languages.js";
export { translationResources } from "./resources.js";
export type { TranslationDictionary } from "./resources.js";
