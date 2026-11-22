import { describe, expect, it } from "@effect/vitest";
import { $IdentityId } from "@vidbee/identity/packages";
import * as Effect from "effect/Effect";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import { LiteralKit } from "../src/LiteralKit/index.js";
import { getSomesStruct } from "../src/Option.js";
import { withStatics } from "../src/SchemaUtils/withStatics.js";

describe("identity integration", () => {
  it.effect("retain LiteralKit statics and symbol/accessor descriptors without invoking getters", () =>
    Effect.sync(() => {
      const $I = $IdentityId.create("test/Identity.test");
      const source = LiteralKit(["a", "b"]);
      const symbol = Symbol.for("test/custom");
      let reads = 0;
      Reflect.defineProperty(source, symbol, {
        get: () => {
          reads += 1;
          return 42;
        },
        configurable: true,
        enumerable: false,
      });
      const rebuilt = source.pipe($I.annoteSchema("Letters", { description: "Two named letters." }));
      expect(reads).toBe(0);
      expect(rebuilt.Enum.a).toBe("a");
      expect(rebuilt.is.a("a")).toBe(true);
      expect(rebuilt.pick(["a"]).Enum.a).toBe("a");
      expect(rebuilt.omit(["b"]).Enum.a).toBe("a");
      expect(rebuilt.mapMembers((members) => members).members.length).toBe(2);
      const union = rebuilt.toTaggedUnion("kind")({ a: { value: S.String }, b: { value: S.Int } });
      const afterUnion = union.pipe($I.annoteSchema("Events", { description: "Tagged helper descriptors." }));
      expect(afterUnion.guards.a({ kind: "a", value: "value" })).toBe(true);
      expect(Reflect.getOwnPropertyDescriptor(afterUnion, "guards")).toEqual(
        Reflect.getOwnPropertyDescriptor(union, "guards")
      );
      expect(rebuilt.match("a", { a: () => 1, b: () => 2 })).toBe(1);
      expect(Reflect.getOwnPropertyDescriptor(rebuilt, symbol)).toEqual(
        Reflect.getOwnPropertyDescriptor(source, symbol)
      );
    })
  );

  it.effect("retains domain statics through annotation and compacts heterogeneous fields", () =>
    Effect.sync(() => {
      const source = S.String.annotate({});
      const augmented = withStatics(source, () => ({ empty: "" }));
      expect(augmented).toBe(source);
      const annotated = augmented.pipe(
        $IdentityId.create("test/Domain").annoteSchema("Domain", { description: "Domain static proof." })
      );
      expect(annotated.empty).toBe("");
      expect(() => withStatics(source, () => ({ ast: "invalid" }))).toThrow();
      expect(getSomesStruct({ count: O.some(2), text: O.some("two"), missing: O.none() })).toEqual({
        count: 2,
        text: "two",
      });
    })
  );
});
