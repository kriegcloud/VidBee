import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { NODE } from './fixtures/node-runtime.js'
import { REAL_BROWSER_SKIP } from './fixtures/real-browser.js'

// Root test:audit runs outside Turbo. Host-gated page cases must execute even after a cached skip.
test('audit uncached real-browser page-program gate', { timeout: 600000, skip: REAL_BROWSER_SKIP }, () => {
  const require = createRequire(import.meta.url)
  const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
  const suite = fileURLToPath(new URL('./characterization-page.test.ts', import.meta.url))
  const result = spawnSync(NODE, [cli, 'run', suite], { encoding: 'utf8', timeout: 550000, env: { ...process.env, VIDBEE_REQUIRE_REAL_BROWSER: '1' } })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /2 passed/)
})
