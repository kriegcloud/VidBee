import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import { createInstance } from "i18next";
import { I18nInitializerLive } from "../src/I18n.driver.js";
import {
  I18nOptions,
  LanguageCode,
  LanguageDefinition,
  SystemProfile,
  SystemProfileHints,
  SystemProfileInput,
  TranslationDictionary,
} from "../src/I18n.model.js";
import { createI18nOptions, initSharedI18n } from "../src/init.js";
import { languages } from "../src/languages.js";
import { initSharedI18n as initializeLegacy } from "../src/legacy/index.js";
import { translationResources } from "../src/resources.js";
import type { TranslationObject } from "../src/I18n.model.js";

const decodeDictionary = S.decodeUnknownEffect(TranslationDictionary);
const decodeOptions = S.decodeUnknownEffect(I18nOptions);
const decodeLanguage = S.decodeUnknownEffect(LanguageCode);
const decodeDefinition = S.decodeUnknownEffect(LanguageDefinition);
const decodeInput = S.decodeUnknownEffect(SystemProfileInput);
const decodeHints = S.decodeUnknownEffect(SystemProfileHints);
const decodeProfile = S.decodeUnknownEffect(SystemProfile);

const assertKeys = (dictionary: TranslationObject, english: TranslationObject): void => {
  for (const [key, value] of R.toEntries(dictionary)) {
    expect(english).toHaveProperty(key);
    const fallback = english[key];
    if (typeof value !== "string") {
      expect(typeof fallback).toBe("object");
      if (typeof fallback !== "string" && fallback !== undefined) assertKeys(value, fallback);
    }
  }
};

describe("i18n models", () => {
  it.effect(
    "decodes every packaged locale and its keys against English at test time",
    Effect.fnUntraced(function* () {
      const english = yield* decodeDictionary(translationResources.en?.translation);
      for (const [code, resource] of R.toEntries<string, { translation?: unknown }>(translationResources)) {
        yield* decodeLanguage(code);
        const dictionary = yield* decodeDictionary(resource.translation);
        assertKeys(dictionary, english);
      }
      for (const definition of R.values(languages)) yield* decodeDefinition(definition);
      yield* decodeOptions(createI18nOptions());
      yield* decodeInput({ env: { LANG: "fr", missing: undefined }, locales: ["fr"] });
      yield* decodeHints({ defaultLocale: "ja", env: {} });
      yield* decodeProfile({ language: "fr", preferChina: false });
      expect(S.is(LanguageCode)("unknown")).toBe(false);
      expect(S.is(TranslationDictionary)({ invalid: 42 })).toBe(false);
    })
  );
});

it.layer(I18nInitializerLive)("initialization service", (it) => {
  it.effect(
    "uses the live i18next driver and returns the initialized instance",
    Effect.fnUntraced(function* () {
      const instance = createInstance();
      const result = yield* initSharedI18n(instance, { type: "3rdParty", init: () => {} });
      expect(result).toBe(instance);
      expect(result.t("about.title")).toBe("About");
    })
  );
  it.effect(
    "represents third-party errors as schema-backed errors",
    Effect.fnUntraced(function* () {
      const instance = createInstance();
      const cause = new TypeError("third-party failure");
      vi.spyOn(instance, "init").mockRejectedValue(cause);
      const result = yield* Effect.flip(initSharedI18n(instance, { type: "3rdParty", init: () => {} }));
      expect(result._tag).toBe("I18nInitializationError");
      expect(result.cause).toBe(cause);
    })
  );
});

it("preserves the exact third-party rejection through the legacy Promise facade", () => {
  const instance = createInstance();
  const cause = new TypeError("original error");
  vi.spyOn(instance, "init").mockRejectedValue(cause);
  return expect(initializeLegacy(instance, { type: "3rdParty", init: () => {} })).rejects.toBe(cause);
});
