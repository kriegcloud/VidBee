import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { runPureOracle } from "../../../scripts/cli/characterization/run-oracles.mjs";

it.effect(
  "preserves the immutable public pure oracle in namespace isolation",
  () =>
    Effect.sync(() => {
      const result = runPureOracle();
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }),
  240000
);
