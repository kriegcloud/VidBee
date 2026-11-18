import { describe, expect, it, vi } from "@effect/vitest";
import * as A from "effect/Array";
import * as R from "effect/Record";
import { createInstance } from "i18next";
import { languageList, languages, normalizeLanguageCode, supportedLanguageCodes } from "../src/languages.js";
import { createI18nOptions, initSharedI18n } from "../src/legacy/index.js";
import { detectSystemProfile, isMainlandChineseLocale, languageFromTag } from "../src/legacy/system-locale.js";
import { translationResources } from "../src/resources.js";

const codes = ["en", "es", "ar", "id", "pt", "fr", "it", "zh", "zh-TW", "ko", "ja", "ru", "tr", "de"];

describe("pre-port parity", () => {
  it("pins normalization including distinct Chinese matching rules", () => {
    for (const [input, expected] of [
      ["en", "en"],
      ["ES", "es"],
      ["pt-BR", "pt"],
      ["ZH-tw", "zh-TW"],
      ["zh-HK", "zh"],
      ["ja-JP", "ja"],
      ["en_US", "en"],
      [" fr ", "en"],
      ["unknown", "en"],
      ["", "en"],
      [null, "en"],
      [undefined, "en"],
    ] as const) {
      expect(normalizeLanguageCode(input)).toBe(expected);
    }
  });
  it("pins language table and resource identity and order", () => {
    expect(supportedLanguageCodes).toEqual(codes);
    expect(languageList).toEqual(
      A.map(codes, (code) => ({ value: code, ...languages[code as keyof typeof languages] }))
    );
    expect(R.keys<string, unknown>(translationResources)).toEqual(codes);
    for (const code of codes) expect(translationResources[code]?.translation).toBeTypeOf("object");
    expect(translationResources.en?.translation).toBe(createI18nOptions().resources?.en?.translation);
    expect(languages.pt.hreflang).toBe("pt-BR");
    expect(languages["zh-TW"].name).toBe("繁體中文");
  });
  it("pins the complete options value", () => {
    expect(createI18nOptions()).toEqual({
      resources: translationResources,
      lng: "en",
      fallbackLng: "en",
      supportedLngs: codes,
      interpolation: { escapeValue: false },
    });
  });
  it("initializes once with the supplied binding and translates two languages", () => {
    const instance = createInstance();
    const initialize = vi.fn();
    const binding = { type: "3rdParty", init: initialize } as const;
    const init = vi.spyOn(instance, "init");
    return initSharedI18n(instance, binding).then((initialized) => {
      expect(initialized).toBe(instance);
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
      expect(instance.t("about.title")).toBe("About");
      return instance.changeLanguage("es").then(() => {
        expect(instance.t("about.title")).toBe("Acerca de");
        return initSharedI18n(instance, binding).then((initialized) => {
          expect(initialized).toBe(instance);
          expect(init).toHaveBeenCalledTimes(1);
          expect(initialize).toHaveBeenCalledTimes(1);
        });
      });
    });
  });
  it("does not touch an instance already initialized by its consumer", () => {
    const instance = createInstance();
    return instance.init({ lng: "fr", resources: { fr: { translation: { own: "consumer" } } } }).then(() => {
      const binding = { type: "3rdParty", init: vi.fn() } as const;
      return initSharedI18n(instance, binding).then((initialized) => {
        expect(initialized).toBe(instance);
        expect(binding.init).not.toHaveBeenCalled();
        expect(instance.t("own")).toBe("consumer");
        expect(instance.language).toBe("fr");
      });
    });
  });
  it("pins tag parsing and mainland detection", () => {
    for (const [tag, language, mainland] of [
      ["zh_CN.UTF-8", "zh", true],
      ["zh", "zh", true],
      ["zh-Hans-CN", "zh", true],
      ["zh-Hant-CN", "zh-TW", false],
      ["zh_HK", "zh-TW", false],
      ["zh-MO", "zh-TW", false],
      ["zh_TW", "zh-TW", false],
      [" FR_fr.UTF-8 ", "fr", false],
      ["pt_BR", "pt", false],
      ["C", null, false],
      ["POSIX", null, false],
      ["zz", null, false],
      ["", null, false],
      [null, null, false],
      [undefined, null, false],
    ] as const) {
      expect(languageFromTag(tag)).toBe(language);
      expect(isMainlandChineseLocale(tag)).toBe(mainland);
    }
  });
  it("pins profile precedence and independent China preference", () => {
    const cases = [
      [{ env: {}, locales: ["en-US"], timeZone: "", countryCode: "" }, "en", false],
      [{ env: { VIDBEE_LANGUAGE: "fr" }, locales: ["zh-CN"], timeZone: "Asia/Tokyo" }, "fr", false],
      [{ env: { VIDBEE_LANGUAGE: "en" }, locales: ["ja"], timeZone: "Asia/Shanghai" }, "en", true],
      [{ env: { VIDBEE_LANGUAGE: "invalid" }, locales: ["C", "de", "ja"], timeZone: "Asia/Tokyo" }, "de", false],
      [{ env: { LANG: "fr", LC_ALL: "ja", LC_MESSAGES: "de" }, timeZone: "" }, "fr", false],
      [{ env: { LANG: "C", LC_ALL: "ja", LC_MESSAGES: "de" }, locales: [], timeZone: "" }, "ja", false],
      [{ env: { LANG: "C", LC_ALL: "POSIX", LC_MESSAGES: "de" }, timeZone: "" }, "de", false],
      [{ env: { LANG: "fr" }, locales: ["ja"], timeZone: "" }, "ja", false],
      [{ env: {}, locales: ["en", "ja"], timeZone: "Asia/Tokyo" }, "ja", false],
      [{ env: {}, locales: ["en"], timeZone: "unknown", countryCode: " br " }, "pt", false],
      [{ env: {}, locales: ["zh-SG"], timeZone: "" }, "zh", true],
      [{ env: {}, locales: ["zh-TW"], timeZone: "", countryCode: "cn" }, "zh-TW", true],
      [{ env: {}, locales: ["en"], timeZone: "Asia/Hong_Kong" }, "zh-TW", false],
      [{ env: {}, locales: ["en"], timeZone: "", countryCode: "SG" }, "zh", false],
    ] as const;
    for (const [input, language, preferChina] of cases)
      expect(detectSystemProfile(input)).toEqual({ language, preferChina });
  });
  it("pins every mapped timezone and country", () => {
    for (const [timeZone, language] of R.toEntries({
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
    })) {
      expect(detectSystemProfile({ env: {}, locales: ["C"], timeZone })).toEqual({
        language,
        preferChina: language === "zh",
      });
    }
    for (const [countryCode, language] of R.toEntries({
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
    })) {
      expect(detectSystemProfile({ env: {}, locales: ["C"], timeZone: "", countryCode })).toEqual({
        language,
        preferChina: countryCode === "CN",
      });
    }
  });
  it("reads fresh environment and Intl defaults and tolerates unavailable Intl", () => {
    vi.stubEnv("VIDBEE_LANGUAGE", "ja");
    expect(detectSystemProfile().language).toBe("ja");
    vi.stubEnv("VIDBEE_LANGUAGE", "fr");
    expect(detectSystemProfile().language).toBe("fr");
    vi.unstubAllEnvs();
    const resolved = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    resolved.mockReturnValue({
      locale: "ja",
      timeZone: "Asia/Shanghai",
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
    });
    expect(detectSystemProfile({ env: {} })).toEqual({ language: "ja", preferChina: true });
    resolved.mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(detectSystemProfile({ env: {} })).toEqual({ language: "en", preferChina: false });
    resolved.mockRestore();
  });
});
