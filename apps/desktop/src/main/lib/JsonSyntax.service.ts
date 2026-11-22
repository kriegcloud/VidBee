import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { OriginalFailure } from "./OriginalFailure.errors.js";

/** Compatibility injects native syntax diagnostics; strict consumers never recreate them. */
export class JsonSyntax extends Context.Service<
  JsonSyntax,
  {
    readonly parse: (source: string) => Effect.Effect<unknown, OriginalFailure>;
  }
>()("vidbee/main/lib/JsonSyntax.service/JsonSyntax") {}
