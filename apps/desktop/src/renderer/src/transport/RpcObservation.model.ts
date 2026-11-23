import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as Issue from "effect/SchemaIssue";
import { failure } from "./DocumentDelivery.errors.js";

const $TransportId = $DesktopId.create("renderer/src/transport/RpcObservation.model");

/**
 * Decoded representation validated by {@link WireValue}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type WireValue =
  | { readonly t: "u" }
  | { readonly t: "null" }
  | { readonly t: "s"; readonly v: string }
  | { readonly t: "b"; readonly v: boolean }
  | { readonly t: "n"; readonly v: string }
  | { readonly t: "i"; readonly v: string }
  | { readonly t: "a"; readonly v: ReadonlyArray<WireValue> }
  | { readonly t: "o"; readonly v: ReadonlyArray<readonly [string, WireValue]> };
/**
 * Validates the recursive tagged observation tree used to preserve native JavaScript observations across JSON, including undefined, exceptional numbers and ordered object keys.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { WireValue } from "./RpcObservation.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(WireValue)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const WireValue: S.Codec<WireValue> = S.suspend(() =>
  S.Union([
    S.Struct({ t: S.Literal("u") }),
    S.Struct({ t: S.Literal("null") }),
    S.Struct({ t: S.Literal("s"), v: S.String }),
    S.Struct({ t: S.Literal("b"), v: S.Boolean }),
    S.Struct({ t: S.Literal("n"), v: S.String }),
    S.Struct({ t: S.Literal("i"), v: S.String }),
    S.Struct({ t: S.Literal("a"), v: S.Array(WireValue) }),
    S.Struct({ t: S.Literal("o"), v: S.Array(S.Tuple([S.String, WireValue])) }),
  ])
).pipe(
  $TransportId.annoteSchema("WireValue", { description: "Wire Value boundary in the desktop transport contract." })
);
const numericToken = (value: number) => (Object.is(value, -0) ? "-0" : value.toString());
// A 32-byte minimum per counted node bounds traversal by the existing 64-MiB
// observation ceiling. The former independent 65,536-node limit rejected a
// 440-KiB structured settings document; the byte account now also bounds nodes.
const observationBytes = 64 * 1024 * 1024;
const minimumNodeBytes = 32;
const makeBudget = () => {
  let nodes = 0;
  let bytes = 0;
  return (depth: number, textBytes = 32) => {
    nodes++;
    bytes += textBytes < minimumNodeBytes ? minimumNodeBytes : textBytes;
    return depth <= 64 && nodes <= observationBytes / minimumNodeBytes && bytes <= observationBytes;
  };
};
/**
 * Packs a native observation into bounded JSON-safe tags, preserving exceptional numbers, undefined and object key order; cycles and unsupported descriptors fail visibly.
 *
 * **Example** (Use pack with its owner)
 *
 * ```ts
 * import { pack } from "./RpcObservation.model.js"
 * import * as Effect from "effect/Effect"
 * export const packedTag = pack({ value: undefined, count: -0 }).pipe(Effect.map((wire) => wire.t));
 * // Running packedTag yields "o" for this ordered object observation.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const pack = Effect.fn("RpcObservation.pack")(function* (input: unknown) {
  const budget = makeBudget();
  const visit = Effect.fn("RpcObservation.packNode")(function* (
    value: unknown,
    ancestors: ReadonlyArray<object>,
    depth: number
  ): Effect.fn.Return<WireValue, import("./DocumentDelivery.errors.ts").DeliveryError> {
    if (!budget(depth)) return yield* failure("ObservationCapacity");
    if (value === undefined) return { t: "u" };
    if (value === null) return { t: "null" };
    if (P.isString(value)) {
      if (!budget(depth, value.length * 6)) return yield* failure("ObservationCapacity");
      return { t: "s", v: value };
    }
    if (P.isBoolean(value)) return { t: "b", v: value };
    if (P.isNumber(value)) return { t: "n", v: numericToken(value) };
    if (P.isBigInt(value)) return { t: "i", v: value.toString() };
    if (!P.isObjectOrArray(value) || A.contains(ancestors, value)) return yield* failure("UnsupportedObservation");
    const next = A.append(ancestors, value);
    if (A.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) return yield* failure("UnsupportedArrayProperties");
      for (let i = 0; i < value.length; i++) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, i.toString());
        if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true)
          return yield* failure("UnsupportedArrayIndex");
      }
      return { t: "a", v: yield* Effect.forEach(value, (child) => visit(child, next, depth + 1), { concurrency: 1 }) };
    }
    const prototype: unknown = Reflect.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) return yield* failure("UnsupportedPrototype");
    const entries: Array<readonly [string, WireValue]> = [];
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!P.isString(key) || descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true)
        return yield* failure("UnsupportedDescriptor");
      if (!budget(depth, key.length * 6)) return yield* failure("ObservationCapacity");
      const child: unknown = descriptor.value;
      entries.push([key, yield* visit(child, next, depth + 1)]);
    }
    return { t: "o", v: entries };
  });
  return yield* visit(input, [], 0);
});
/**
 * Reconstructs a native observation from its bounded tagged tree without JSON normalization of undefined or exceptional numeric values.
 *
 * **Example** (Use unpack with its owner)
 *
 * ```ts
 * import { unpack } from "./RpcObservation.model.js"
 * export const decoded = unpack({ t: "u" });
 * // Running decoded yields undefined, rather than omitting the observation.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const unpack = Effect.fn("RpcObservation.unpack")(function* (input: WireValue) {
  const budget = makeBudget();
  const visit = Effect.fn("RpcObservation.unpackNode")(function* (
    node: WireValue,
    depth: number
  ): Effect.fn.Return<unknown, import("./DocumentDelivery.errors.ts").DeliveryError> {
    if (!budget(depth)) return yield* failure("ObservationCapacity");
    if (node.t === "u") return undefined;
    if (node.t === "null") return null;
    if (node.t === "s") {
      if (!budget(depth, node.v.length * 6)) return yield* failure("ObservationCapacity");
      return node.v;
    }
    if (node.t === "b") return node.v;
    if (node.t === "n") {
      const value = Number(node.v);
      if (numericToken(value) !== node.v) return yield* failure("NoncanonicalNumber");
      return value;
    }
    if (node.t === "i") {
      const value = yield* Effect.try({ try: () => BigInt(node.v), catch: () => failure("NoncanonicalBigInt") });
      if (value.toString() !== node.v) return yield* failure("NoncanonicalBigInt");
      return value;
    }
    if (node.t === "a") return yield* Effect.forEach(node.v, (child) => visit(child, depth + 1), { concurrency: 1 });
    const keys = A.map(node.v, ([key]) => key);
    if (A.dedupe(keys).length !== keys.length) return yield* failure("DuplicateObservationKey");
    const entries = yield* Effect.forEach(
      node.v,
      Effect.fn("RpcObservation.entry")(function* ([key, child]) {
        if (!budget(depth, key.length * 6)) return yield* failure("ObservationCapacity");
        const value = yield* visit(child, depth + 1);
        const entry: readonly [string, unknown] = [key, value];
        return entry;
      }),
      { concurrency: 1 }
    );
    return R.fromEntries(entries);
  });
  return yield* visit(input, 0);
});
/**
 * Converts a bounded tagged observation tree to its native JavaScript value and back; packing rejects cycles, accessors and unsupported objects instead of silently normalizing them.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ObservedValue } from "./RpcObservation.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ObservedValue)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ObservedValue: S.Codec<unknown, WireValue> = WireValue.pipe(
  S.decodeTo(S.Unknown, {
    decode: Getter.transformEffect((input, options) =>
      unpack(input).pipe(
        Effect.mapError(() => new Issue.InvalidValue({ expected: "canonical bounded observation" }, input, options))
      )
    ),
    encode: Getter.transformEffect((input, options) =>
      pack(input).pipe(
        Effect.mapError(() => new Issue.InvalidValue({ expected: "supported bounded observation" }, input, options))
      )
    ),
  }),
  $TransportId.annoteSchema("ObservedValue", {
    description: "Observed Value boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link ObservedValue}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ObservedValue = typeof ObservedValue.Type;
/**
 * Adds an observation-preserving wire representation to a projected view: required view fields are validated while additional native fields and key order survive the round trip.
 *
 * **Example** (Use RpcObserved with its owner)
 *
 * ```ts
 * import { RpcObserved } from "./RpcObservation.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const codec = RpcObserved(S.Struct({ name: S.String }));
 * export const encoded = S.encodeResult(codec)({ name: "ready" });
 * if (Result.isSuccess(encoded)) {
 *   const decoded = S.decodeResult(codec)(encoded.success);
 *   if (Result.isSuccess(decoded)) decoded.success.name // => "ready"
 * }
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const RpcObserved = <A, I, RD, RE>(view: S.Codec<A, I, RD, RE>) =>
  ObservedValue.pipe(S.decodeTo(S.declare((input: unknown): input is A => S.is(S.toType(view))(input))));
