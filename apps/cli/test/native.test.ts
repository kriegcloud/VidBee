import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { runNativeOracle } from "../../../scripts/cli/characterization/run-oracles.mjs";

it.effect(
  "runs native service and resource tests inside namespace isolation",
  () =>
    Effect.sync(() => {
      const result = runNativeOracle();
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }),
  300000
);
