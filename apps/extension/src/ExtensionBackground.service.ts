import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtensionError } from "./Extension.errors.js";
export class ExtensionBackground extends Context.Service<
  ExtensionBackground,
  {
    readonly fetchAndCache: (url: string, tabId?: number) => Effect.Effect<void, ExtensionError>;
  }
>()("vidbee-extension/ExtensionBackground.service/ExtensionBackground") {}
