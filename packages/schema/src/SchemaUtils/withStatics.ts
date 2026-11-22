import { IdentityInvariantError } from "@vidbee/identity";
import * as A from "effect/Array";
import { dual } from "effect/Function";

const protocol = [
  "~effect/Schema/Schema",
  "ast",
  "annotate",
  "annotateKey",
  "check",
  "make",
  "makeEffect",
  "makeOption",
  "pipe",
  "rebuild",
];
function install<T extends object, M extends Record<string, unknown>>(self: T, methods: (self: T) => M): T & M;
function install(self: object, methods: (self: object) => Record<string, unknown>): object {
  const statics = methods(self);
  for (const key of Reflect.ownKeys(statics)) {
    if (A.contains(protocol, key) || Reflect.getOwnPropertyDescriptor(self, key) !== undefined) {
      throw IdentityInvariantError.make({ message: "A domain static cannot replace an existing or protocol member." });
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(statics, key);
    if (descriptor !== undefined && !Reflect.defineProperty(self, key, descriptor)) {
      throw IdentityInvariantError.make({ message: "Cannot install domain static descriptor." });
    }
  }
  return self;
}

/** Install non-codec domain statics on the same object, refusing member replacement.
 *
 * **When to use**
 * Use to attach a domain operation before composer annotation preserves its descriptors.
 *
 * **Example** (Retain the source object)
 * ```ts
 * import { withStatics } from "@vidbee/schema/SchemaUtils/withStatics"
 * import * as S from "effect/Schema"
 * import { strictEqual } from "node:assert"
 * const source = S.String.annotate({})
 * const result = withStatics(source, () => ({ empty: "" }))
 * strictEqual(result, source)
 * strictEqual(result.empty, "")
 * ```
 * @throws A schema-backed identity invariant error for conflicting descriptors.
 * @category combinators
 * @since 0.0.0
 */
export const withStatics: {
  <T extends object, M extends Record<string, unknown>>(self: T, methods: (self: T) => M): T & M;
  <T extends object, M extends Record<string, unknown>>(methods: (self: T) => M): (self: T) => T & M;
} = dual(2, install);
