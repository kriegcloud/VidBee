import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import { dual } from "effect/Function";

/**
 * Preserve ordered arguments and append a complete failure Cause when present.
 *
 * **Example** (Keep object identity)
 * ```ts
 * import { logArguments } from "@vidbee/logger/arguments"
 * import * as Cause from "effect/Cause"
 * const details = { count: 2 }
 * logArguments(["done", details], Cause.empty)[1] === details
 * ```
 * @category formatting
 * @since 0.1.0
 */
export const logArguments: {
  (message: unknown, cause: Cause.Cause<unknown>): ReadonlyArray<unknown>;
  (cause: Cause.Cause<unknown>): (message: unknown) => ReadonlyArray<unknown>;
} = dual(2, (message: unknown, cause: Cause.Cause<unknown>): ReadonlyArray<unknown> => {
  const messages = A.isArray(message) ? message : [message];
  const rendered = Cause.pretty(cause);
  return rendered === "" ? messages : [...messages, { cause: rendered }];
});
