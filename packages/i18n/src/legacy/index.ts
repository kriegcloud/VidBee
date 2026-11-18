import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { I18nInitializerLive } from "../I18n.driver.js";
import { initSharedI18n as initialize } from "../init.js";
import type { i18n as I18nInstance, ThirdPartyModule } from "i18next";

export { createI18nOptions } from "../init.js";
export * from "../languages.js";
export { translationResources } from "../resources.js";
export type { TranslationDictionary } from "../resources.js";

const runtime = ManagedRuntime.make(I18nInitializerLive);
export const initSharedI18n: {
  (instance: I18nInstance, reactBinding: ThirdPartyModule): Promise<I18nInstance>;
  (reactBinding: ThirdPartyModule): (instance: I18nInstance) => Promise<I18nInstance>;
} = dual(
  2,
  (instance: I18nInstance, reactBinding: ThirdPartyModule): Promise<I18nInstance> =>
    runtime
      .runPromise(
        Effect.match(initialize(instance, reactBinding), {
          onFailure: (error) => ({ ok: false as const, cause: error.cause }),
          onSuccess: (value) => ({ ok: true as const, value }),
        })
      )
      .then((result) => {
        if (!result.ok) throw result.cause;
        return result.value;
      })
);
