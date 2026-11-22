import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as Issue from "effect/SchemaIssue";

const $TransportId = $DesktopId.create("renderer/src/transport/RpcField.model");

/**
 * Constructs Rpc Undefined with explicit lifetime and failure ownership.
 *
 * **Example** (Use RpcUndefined at its owning boundary)
 *
 * ```ts
 * import { RpcUndefined } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * const validate = S.decodeUnknownEffect(RpcUndefined);
 * void validate({});
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
 * Constructs Rpc Value with explicit lifetime and failure ownership.
 *
 * **Example** (Use RpcValue at its owning boundary)
 *
 * ```ts
 * import { RpcValue } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * const value = RpcValue(S.String);
 * const decode = S.decodeUnknownEffect(value);
 * void decode({ _tag: "RpcValue", value: "ready" });
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
 * Constructs Rpc Optional with explicit lifetime and failure ownership.
 *
 * **Example** (Use RpcOptional at its owning boundary)
 *
 * ```ts
 * import { RpcOptional } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * const payload = S.Struct({ name: RpcOptional(S.String) });
 * const decode = S.decodeUnknownEffect(payload);
 * void decode({});
 * void decode({ name: { _tag: "RpcUndefined" } });
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
 * Constructs Rpc Array with explicit lifetime and failure ownership.
 *
 * **Example** (Use RpcArray at its owning boundary)
 *
 * ```ts
 * import { RpcArray } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * const ids = RpcArray(S.String);
 * void S.encodeEffect(ids)(["first", "second"]);
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
 * Constructs Rpc Mutable Array with explicit lifetime and failure ownership.
 *
 * **Example** (Use RpcMutableArray at its owning boundary)
 *
 * ```ts
 * import { RpcMutableArray } from "./RpcField.model.js"
 * import * as S from "effect/Schema"
 * const ids = RpcMutableArray(S.String);
 * const values: typeof ids.Type = ["first"];
 * values.push("second");
 * void S.encodeEffect(ids)(values);
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
 * Describes Rpc Undefined ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RpcUndefined = typeof RpcUndefined.Type;
