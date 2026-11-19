import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.mjs'], testTimeout: 60000, hookTimeout: 30000, fileParallelism: false },
})
