import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtensionHostFailure } from "./Extension.errors.js";
export class ExtensionNavigation extends Context.Service<
  ExtensionNavigation,
  {
    readonly assign: (uri: string) => Effect.Effect<void, ExtensionHostFailure>;
  }
>()("vidbee-extension/ExtensionNavigation.service/ExtensionNavigation") {}
