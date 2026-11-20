import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mjs", "test/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
