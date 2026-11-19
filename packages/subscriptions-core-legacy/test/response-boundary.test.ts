import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
import type { ResponseBoundaryRecord } from './fixtures/response-boundary.js'

// Recorded only from unchanged old-core.mjs using the same shared host/scenario module.
// All deliberately constructed errors retain exact class/name and message, even for scalar status values.
const expected = JSON.parse(readFileSync(new URL('./fixtures/response-boundary.json', import.meta.url), 'utf8')) as Record<string, ResponseBoundaryRecord>
let actual: Record<string, ResponseBoundaryRecord>
beforeAll(() => {
  actual = JSON.parse(execFileSync(NODE, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/response-boundary.node.ts', import.meta.url))], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  })) as Record<string, ResponseBoundaryRecord>
  assert.deepEqual(Object.keys(actual), Object.keys(expected))
}, 120_000)
for (const [name, old] of Object.entries(expected)) {
  it(`response boundary OLD/NEW: ${name}`, () => {
    const observed = actual[name]
    assert.ok(observed, 'The matching scenario ran under pinned Node')
    if (old.engineFailure) {
      // PORT-GUIDE parity rule: retain OLD engine text in the fixture, require NEW failure.
      assert.equal(observed.outcome.ok, false)
    } else assert.deepEqual(observed.outcome, old.outcome)
  }, 120_000)
}
