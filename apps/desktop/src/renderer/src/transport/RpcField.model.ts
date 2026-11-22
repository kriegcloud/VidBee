import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as Issue from "effect/SchemaIssue";

const $TransportId = $DesktopId.create("renderer/src/transport/RpcField.model");

/**
 * Encodes JavaScript undefined as the explicit RpcUndefined tag and decodes that tag back to undefined, preserving a value that JSON alone cannot represent.
 *
 * **Example** (Use RpcUndefined with its owner)
 *
 * ```ts
 * import { RpcUndefined } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const encoded = S.encodeResult(RpcUndefined)(undefined);
 * if (Result.isSuccess(encoded)) encoded.success._tag // => "RpcUndefined"
 * export const decoded = S.decodeResult(RpcUndefined)({ _tag: "RpcUndefined" });
 * if (Result.isSuccess(decoded)) decoded.success // => undefined
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const RpcUndefined = S.TaggedStruct("RpcUndefined", {}).pipe(
  S.decodeTo(S.Undefined, {
    decode: Getter.transform(() => undefined),
    encode: Getter.transform((): { readonly _tag: "RpcUndefined" } => ({ _tag: "RpcUndefined" })),
  }),
  $TransportId.annoteSchema("RpcUndefined", {
    description: "Rpc Undefined boundary in the desktop transport contract.",
  })
);
/**
 * Wraps a present field value in a RpcValue tag; undefined is rejected so RpcUndefined remains an unambiguous separate wire representation.
 *
 * **Example** (Use RpcValue with its owner)
 *
 * ```ts
 * import { RpcValue } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const codec = RpcValue(S.String);
 * export const decoded = S.decodeResult(codec)({ _tag: "RpcValue", value: "ready" });
 * if (Result.isSuccess(decoded)) decoded.success // => "ready"
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const RpcValue = <A, I, RD, RE>(field: S.Codec<A, I, RD, RE>) =>
  S.TaggedStruct("RpcValue", { value: field }).pipe(
    S.decodeTo(S.toType(field).check(S.makeFilter((value) => value !== undefined)), {
      decode: Getter.transform(({ value }) => value),
      encode: Getter.transform((value): { readonly _tag: "RpcValue"; readonly value: A } => ({
        _tag: "RpcValue",
        value,
      })),
    })
  );
/**
 * Preserves three optional-key states: absent, explicitly undefined and present. It composes tagged field codecs with exact optional keys instead of collapsing them through JSON.
 *
 * **Example** (Use RpcOptional with its owner)
 *
 * ```ts
 * import { RpcOptional } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const codec = S.Struct({ name: RpcOptional(S.String) });
 * export const missing = S.decodeResult(codec)({});
 * export const explicit = S.decodeResult(codec)({ name: { _tag: "RpcUndefined" } });
 * if (Result.isSuccess(missing) && Result.isSuccess(explicit)) {
 *   Reflect.getOwnPropertyDescriptor(missing.success, "name") !== undefined // => false
 *   Reflect.getOwnPropertyDescriptor(explicit.success, "name") !== undefined // => true
 * }
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const RpcOptional = <A, I, RD, RE>(field: S.Codec<A, I, RD, RE>) =>
  S.Union([RpcValue(field), RpcUndefined]).pipe(S.optionalKey, S.mutableKey);

// A typed guard checks a projector's promises without rebuilding its object.
// Its encoded side remains the recursive tagged observation tree.

const dense = (values: unknown): values is ReadonlyArray<unknown> => {
  if (!A.isArray(values) || Reflect.ownKeys(values).length !== values.length + 1) return false;
  for (let i = 0; i < values.length; i++) {
    const property = Reflect.getOwnPropertyDescriptor(values, i.toString());
    if (property === undefined || !("value" in property) || property.enumerable !== true) return false;
  }
  return true;
};
/**
 * Builds an array codec that checks dense own enumerable data indices before mapping elements; sparse indices, accessors, symbol keys and decorations fail admission before item codecs allocate.
 *
 * **Example** (Use RpcArray with its owner)
 *
 * ```ts
 * import { RpcArray } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const ids = RpcArray(S.String);
 * export const encoded = S.encodeResult(ids)(["first", "second"]);
 * if (Result.isSuccess(encoded)) encoded.success // => ["first", "second"]
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const RpcArray = <Item extends S.Constraint>(item: Item) =>
  S.declareConstructor<ReadonlyArray<Item["Type"]>, ReadonlyArray<Item["Encoded"]>>()(
    [item],
    ([item]) =>
      (input, _ast, options) =>
        dense(input)
          ? S.decodeEffect(S.Array(item), options)(input).pipe(Effect.mapError((error) => error.issue))
          : Effect.fail(new Issue.InvalidValue({ message: "Dense data array required" }, input, options)),
    {
      identifier: "DenseRpcArray",
      title: "Dense RPC array",
      description: "Own enumerable indices without decorations, holes or accessors.",
      toCodecJson: ([item]) =>
        S.link<ReadonlyArray<Item["Encoded"]>>()(S.Array(item), {
          decode: Getter.passthrough(),
          encode: Getter.passthrough(),
        }),
    }
  );
/**
 * Builds the mutable TypeScript view of the same dense-array codec as RpcArray; mutation is permitted locally but wire admission still rejects holes, accessors and decorations.
 *
 * **Example** (Use RpcMutableArray with its owner)
 *
 * ```ts
 * import { RpcMutableArray } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const ids = RpcMutableArray(S.String);
 * export const values: typeof ids.Type = ["first"];
 * values.push("second");
 * export const encoded = S.encodeResult(ids)(values);
 * if (Result.isSuccess(encoded)) encoded.success // => ["first", "second"]
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const RpcMutableArray = <Item extends S.Constraint>(item: Item) =>
  S.declareConstructor<Array<Item["Type"]>, Array<Item["Encoded"]>>()(
    [item],
    ([item]) =>
      (input, _ast, options) =>
        dense(input)
          ? S.decodeUnknownEffect(
              S.Array(item).pipe(S.mutable),
              options
            )(input).pipe(Effect.mapError((error) => error.issue))
          : Effect.fail(new Issue.InvalidValue({ message: "Dense mutable data array required" }, input, options)),
    {
      identifier: "DenseMutableRpcArray",
      title: "Dense mutable RPC array",
      description: "Mutable own enumerable indices without decorations, holes or accessors.",
      toCodecJson: ([item]) =>
        S.link<Array<Item["Encoded"]>>()(S.Array(item).pipe(S.mutable), {
          decode: Getter.passthrough(),
          encode: Getter.passthrough(),
        }),
    }
  );

/**
 * Decoded representation validated by {@link RpcUndefined}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RpcUndefined = typeof RpcUndefined.Type;
