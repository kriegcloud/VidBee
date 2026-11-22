import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtensionHostFailure } from "./Extension.errors.js";
export interface PopupSession {
  readonly release: Effect.Effect<void>;
}
export class PopupController extends Context.Service<
  PopupController,
  {
    readonly beginSession: (retryTrigger: number) => Effect.Effect<PopupSession, ExtensionHostFailure>;
    readonly retry: Effect.Effect<void>;
    readonly download: Effect.Effect<void, ExtensionHostFailure>;
    readonly openClientAndRetry: Effect.Effect<void, ExtensionHostFailure>;
  }
>()("vidbee-extension/PopupController.service/PopupController") {}
