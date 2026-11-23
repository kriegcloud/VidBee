import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { IdentityInvariantError } from "../src/Identity.errors.js";
import { composer, defaultKey, locationKey, preserve } from "../src/internal/composer.js";
import { $ExtensionId, $IdentityId, $LoggerId } from "../src/packages.js";

describe("deterministic composers", () => {
  it.effect("match default builder basename, nested index, service, app and test paths", () =>
    Effect.sync(() => {
      expect(locationKey("@vidbee/example", "Foo", "Foo")).toBe("@vidbee/example/Foo");
      expect(defaultKey("@vidbee/example", "src/nested/INDEX.ts", "Foo")).toBe("@vidbee/example/nested/Foo");
      expect(defaultKey("@vidbee/example", "test/Foo.test.ts", "Check")).toBe("@vidbee/example/test/Foo.test/Check");
      expect(locationKey("@vidbee/example", "nested/INDEX", "Foo")).toBe("@vidbee/example/nested/Foo");
      expect($LoggerId.create("Logger.service")`NodeSink`).toBe("@vidbee/logger/Logger.service/NodeSink");
      expect($ExtensionId.create("PopupController.service")`PopupController`).toBe(
        "vidbee-extension/PopupController.service/PopupController"
      );
      expect($IdentityId.create("test/Identity.test")`Test`).toBe("@vidbee/identity/test/Identity.test/Test");
      expect($LoggerId.create("a").create("b")`Name`).toBe("@vidbee/logger/a/b/Name");
    })
  );
  it.effect("reject malformed children and template arrays with tagged errors", () =>
    Effect.sync(() => {
      for (const child of ["", "/absolute", "../escape", "a//b", "a/./b", "a\\b", "${name}"]) {
        expect(() => $LoggerId.create(child)).toThrow(IdentityInvariantError);
      }
      const tag = composer("@vidbee/logger", "Logger.service");
      expect(() => Reflect.apply(tag, undefined, [{ 0: "Bad", length: 2, raw: ["Bad"] }])).toThrow(
        IdentityInvariantError
      );
    })
  );
  it.effect("reserve identity fields at runtime and preserve inherited identifiers", () =>
    Effect.sync(() => {
      const $I = $IdentityId.create("test/Identity.test");
      expect(() => $I.annote("Name", { description: "invalid", identifier: "override" })).toThrow(
        IdentityInvariantError
      );
      const source = S.String.annotate({ identifier: "frozen" }).pipe(
        $I.annoteSchema("Source", { description: "Frozen identifier fixture." })
      );
      const result = source.pipe($I.annoteSchema("Name", { description: "Retained identity." }));
      expect(SchemaAST.resolveIdentifier(result.ast)).toBe("frozen");
      expect(
        SchemaAST.resolveIdentifier(S.String.pipe($I.annoteSchema("Fresh", { description: "New schema." })).ast)
      ).toBe("@vidbee/identity/test/Identity.test/Fresh");
    })
  );
  it.effect("refuse a failed descriptor installation", () =>
    Effect.sync(() => {
      const source = S.String.annotate({}).pipe(
        $IdentityId.create("test/Identity.test").annoteSchema("Source", { description: "Descriptor source fixture." })
      );
      Reflect.defineProperty(source, "custom", { value: 1 });
      const target = S.String.annotate({}).pipe(
        $IdentityId.create("test/Identity.test").annoteSchema("Target", { description: "Descriptor target fixture." })
      );
      Reflect.preventExtensions(target);
      expect(() => preserve(source, target)).toThrow(IdentityInvariantError);
    })
  );
});
