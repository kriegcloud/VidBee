import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { OriginalFailure } from "./OriginalFailure.errors.js";

/**
 * Compatibility injects native syntax diagnostics; strict consumers never recreate them.
 *
 * **Example** (Use JsonSyntax at its owning boundary)
 *
 * ```ts
 * import { JsonSyntax } from "./JsonSyntax.service.js"
 * import * as Effect from "effect/Effect"
 * const access = JsonSyntax.use(Effect.succeed);
 * void access;
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class JsonSyntax extends Context.Service<
  JsonSyntax,
  {
    readonly parse: (source: string) => Effect.Effect<unknown, OriginalFailure>;
  }
>()("vidbee/main/lib/JsonSyntax.service/JsonSyntax") {}
