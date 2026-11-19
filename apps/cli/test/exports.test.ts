import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { runExportOracle } from "../../../scripts/cli/characterization/run-oracles.mjs";

it.effect(
  "pins the three public export manifests and their kinds in isolation",
  () =>
    Effect.sync(() => {
      const result = runExportOracle();
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }),
  60000
);
