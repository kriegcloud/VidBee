import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { runExportOracle, runReviewRegressions } from "../../../scripts/cli/characterization/run-oracles.mjs";

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

it.effect("pins review regressions in distribution metadata and frozen packaged goldens", () =>
  Effect.sync(() => {
    const result = runReviewRegressions();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  })
);
