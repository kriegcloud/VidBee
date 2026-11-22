import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
export const RpcUndefined = S.TaggedStruct("RpcUndefined", {}).pipe(
  S.decodeTo(S.Undefined, {
    decode: Getter.transform(() => undefined),
    encode: Getter.transform((): { readonly _tag: "RpcUndefined" } => ({ _tag: "RpcUndefined" })),
  })
);
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
export const RpcOptional = <A, I, RD, RE>(field: S.Codec<A, I, RD, RE>) =>
  S.Union([RpcValue(field), RpcUndefined]).pipe(S.optionalKey, S.mutableKey);

// A typed guard checks a projector's promises without rebuilding its object.
// Its encoded side remains the recursive tagged observation tree.

export const RpcArray = <Item extends S.Constraint>(item: Item) =>
  S.Array(item).check(
    S.makeFilter((values) => {
      if (Reflect.ownKeys(values).length !== values.length + 1) return "Dense arrays without extra properties required";
      for (let i = 0; i < values.length; i++) {
        const property = Reflect.getOwnPropertyDescriptor(values, String(i));
        if (property === undefined || !("value" in property) || property.enumerable !== true)
          return "Dense data indices required";
      }
      return true;
    })
  );

export type RpcUndefined = typeof RpcUndefined.Type;
