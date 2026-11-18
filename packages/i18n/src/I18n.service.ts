import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { i18n as I18nInstance, ThirdPartyModule } from "i18next";
import type { I18nInitializationError } from "./I18n.errors.js";

export class I18nInitializer extends Context.Service<
  I18nInitializer,
  {
    readonly initialize: (
      instance: I18nInstance,
      reactBinding: ThirdPartyModule
    ) => Effect.Effect<I18nInstance, I18nInitializationError>;
  }
>()("@vidbee/i18n/I18n.service/I18nInitializer") {}
