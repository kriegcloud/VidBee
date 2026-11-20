import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['apps/cli-legacy/test/native/*.test.ts'],testTimeout:30000}});
