import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { OriginalFailure } from "./OriginalFailure.errors.js";

/**
 * Parses native JSON through the injected compatibility unit so malformed-input diagnostics preserve the original native thrown value and legacy error text.
 *
 * **Example** (Use JsonSyntax with its owner)
 *
 * ```ts
 * import { JsonSyntax } from "./JsonSyntax.service.js"
 * import * as Effect from "effect/Effect"
 * export const parsed = JsonSyntax.use((syntax) => Effect.result(syntax.parse("{bad")));
 * // Provide the native compatibility parser; the failure retains its native syntax diagnostic.
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
