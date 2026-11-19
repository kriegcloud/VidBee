import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtensionRequestFailure } from "./Extension.errors.js";
export class ExtensionHttp extends Context.Service<
  ExtensionHttp,
  {
    readonly requestJson: (
      method: "GET" | "POST",
      url: string,
      deadlineMs: number
    ) => Effect.Effect<unknown, ExtensionRequestFailure>;
  }
>()("vidbee-extension/ExtensionHttp.service/ExtensionHttp") {}
