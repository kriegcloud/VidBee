import { expect, it } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { NODE } from "./fixtures/node-runtime.js";
import { offline, REAL_BROWSER_SKIP } from "./fixtures/real-browser.js";
it.skipIf(REAL_BROWSER_SKIP !== false)("serializes real production page programs in a loopback-only network namespace", () => {
  const result = spawnSync(...offline(NODE, ['--import', 'tsx', new URL("./fixtures/playback-page-native.mjs", import.meta.url).pathname]), {encoding: "utf8", timeout: 120000});
  expect(result.error, result.stdout + result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("page programs passed");
  expect(result.stdout).toContain("opaque driver passed");
}, 180000);
