import { expect, it } from "@effect/vitest";
import { createInstance } from "i18next";
import { normalizeLanguageCode } from "../src/languages.js";
import { initSharedI18n } from "../src/legacy/index.js";
import { detectSystemProfile } from "../src/legacy/system-locale.js";
import { isMainlandChineseLocale, languageFromTag } from "../src/system-locale.js";

it("M18: corrupt falsy language values retain the pre-port defaults", () => {
  for (const value of [null, undefined, 0, Number.NaN, false, ""]) {
    expect(Reflect.apply(normalizeLanguageCode, undefined, [value])).toBe("en");
    expect(Reflect.apply(languageFromTag, undefined, [value])).toBe(null);
    expect(Reflect.apply(isMainlandChineseLocale, undefined, [value])).toBe(false);
  }
});

it("dual audit: data-last initialization receives its instance after binding", () => {
  const instance = createInstance();
  const binding = { type: "3rdParty", init: () => undefined } as const;
  return initSharedI18n(binding)(instance).then((result) => {
    expect(result).toBe(instance);
    expect(instance.t("about.title")).toBe("About");
  });
});

it("U3: legacy falsy locale lists retain the pre-port environment fallback", () => {
  for (const locales of [null, undefined, false, 0, "", Number.NaN]) {
    expect(
      Reflect.apply(detectSystemProfile, undefined, [
        { locales, env: { LANG: "fr_FR.UTF-8" }, timeZone: "Europe/Berlin" },
      ])
    ).toEqual({ language: "fr", preferChina: false });
  }
});
