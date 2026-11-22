import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { failure } from "./DocumentDelivery.errors.js";

const $TransportId = $DesktopId.create("renderer/src/transport/RpcCensus.model");

/**
 * Independent of schema keys: own-key order, array identity/length and Object.is leaves.
 *
 * **Example** (Use sameObservation at its owning boundary)
 *
 * ```ts
 * import { sameObservation } from "./RpcCensus.model.js"
 * const preserved = sameObservation({ left: { value: undefined }, right: { value: undefined } });
 * void preserved;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const sameObservation = ({ left, right }: { readonly left: unknown; readonly right: unknown }): boolean => {
  if (Object.is(left, right)) return true;
  if (!P.isObjectOrArray(left) || !P.isObjectOrArray(right) || A.isArray(left) !== A.isArray(right)) return false;
  if (A.isArray(left) && A.isArray(right) && left.length !== right.length) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (let i = 0; i < leftKeys.length; i++) {
    const key = leftKeys[i];
    if (key === undefined || key !== rightKeys[i]) return false;
    const a = Reflect.getOwnPropertyDescriptor(left, key);
    const b = Reflect.getOwnPropertyDescriptor(right, key);
    if (a === undefined || b === undefined || !("value" in a) || !("value" in b) || a.enumerable !== b.enumerable)
      return false;
    const av: unknown = a.value;
    const bv: unknown = b.value;
    if (!sameObservation({ left: av, right: bv })) return false;
  }
  return true;
};
/**
 * Supply the complete selected declaration's payload/success schema, including envelopes.
 *
 * **Example** (Use census at its owning boundary)
 *
 * ```ts
 * import { census } from "./RpcCensus.model.js"
 * import * as S from "effect/Schema"
 * const roundTrip = census({ schema: S.String, value: "hello" });
 * void roundTrip;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const census = Effect.fn("RpcCensus.roundTrip")(function* <A, I, RD, RE>({
  schema,
  value,
}: {
  readonly schema: S.Codec<A, I, RD, RE>;
  readonly value: A;
}) {
  const codec = schema.pipe(
    S.toCodecJson,
    S.fromJsonString,
    $TransportId.annoteSchema("codec", { description: "codec boundary in the desktop transport contract." })
  );
  const encoded = yield* S.encodeEffect(codec)(value);
  const decoded = yield* S.decodeEffect(codec)(encoded);
  if (!sameObservation({ left: value, right: decoded })) return yield* failure("CensusMismatch");
  return decoded;
});
