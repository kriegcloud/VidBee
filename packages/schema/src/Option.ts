import * as R from "effect/Record";
import type * as O from "effect/Option";

/** Preserve the heterogeneous values of known optional fields.
 * @category type-level
 * @since 0.0.0
 */
export type GetSomes<T extends Readonly<Record<string, O.Option<unknown>>>> = Partial<{
  readonly [K in keyof T & string]: O.Option.Value<T[K]>;
}>;

/** Compact Some fields without claiming that any input key is present.
 *
 * **When to use**
 * Use when a fixed-key object contains heterogeneous Option values.
 *
 * **Example** (Compact optional fields)
 * ```ts
 * import { getSomesStruct } from "@vidbee/schema/Option"
 * import * as O from "effect/Option"
 * import { strictEqual } from "node:assert"
 * const result = getSomesStruct({ count: O.some(2), label: O.none<string>() })
 * strictEqual(result.count, 2)
 * strictEqual("label" in result, false)
 * ```
 * @category filtering
 * @since 0.0.0
 */
export function getSomesStruct<const T extends Readonly<Record<string, O.Option<unknown>>>>(self: T): GetSomes<T>;
export function getSomesStruct(self: Readonly<Record<string, O.Option<unknown>>>): Readonly<Record<string, unknown>> {
  return R.getSomes(self);
}
