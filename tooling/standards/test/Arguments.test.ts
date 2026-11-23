import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as O from "effect/Option";
import { parseArguments } from "../src/Arguments.js";

describe("CLI selection", () => {
  it.effect("preserves repeatable exact packages and protected roots", () =>
    Effect.gen(function* () {
      const parsed = yield* parseArguments([
        "check",
        "--package",
        "@vidbee/schema",
        "--package",
        "@vidbee/logger",
        "--require-clean",
        "--json",
        "--source-root",
        "/source",
        "--trusted-root",
        "/trusted",
      ]);
      expect(parsed.packages).toEqual(["@vidbee/schema", "@vidbee/logger"]);
      expect(parsed.requireClean).toBe(true);
      expect(parsed.json).toBe(true);
      expect(parsed.sourceRoot).toEqual(O.some("/source"));
      expect(parsed.trustedRoot).toEqual(O.some("/trusted"));
    })
  );
  it.effect("rejects unsupported and ambiguous requests", () =>
    Effect.gen(function* () {
      for (const args of [
        [],
        ["check", "--ignore", "x"],
        ["check", "--package", ""],
        ["check", "--json", "--json"],
        ["check", "--phase", "10", "--package", "x"],
        ["docs", "--phase", "10"],
        ["check", "--verify-from", "base"],
        ["check", "--phase", "9"],
      ]) {
        const result = yield* Effect.result(parseArguments(args));
        expect(result._tag).toBe("Failure");
      }
    })
  );
});
