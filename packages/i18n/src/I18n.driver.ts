import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { I18nInitializationError } from "./I18n.errors.js";
import { I18nInitializer } from "./I18n.service.js";
import { createI18nOptions } from "./init.js";
import type { i18n as I18nInstance, ThirdPartyModule } from "i18next";

export const I18nInitializerLive = Layer.succeed(I18nInitializer, {
  initialize: Effect.fn("I18nInitializer.initialize")((instance: I18nInstance, reactBinding: ThirdPartyModule) =>
    Effect.tryPromise({
      try: () => {
        if (instance.isInitialized) return Promise.resolve(instance);
        return instance
          .use(reactBinding)
          .init(createI18nOptions())
          .then(() => instance);
      },
      catch: (cause) => I18nInitializationError.make({ cause }),
    })
  ),
});
