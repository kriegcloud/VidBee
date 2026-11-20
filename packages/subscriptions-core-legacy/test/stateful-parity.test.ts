import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, it } from 'vitest'
import { NODE } from './fixtures/node-runtime.js'
import { STATEFUL_SCENARIOS } from './fixtures/stateful-oracle.js'

// Recorded from the unchanged pre-port bundle under repository-pinned Node.
// Fixed clocks/URLs/paths and fake host gates make these receipts environment invariant.
// Only generated lease identifiers are named by first appearance; identity relationships remain pinned.
const expected = JSON.parse(readFileSync(new URL('./fixtures/stateful-oracle.json', import.meta.url), 'utf8')) as Record<string, unknown>
let actual: Record<string, unknown>
beforeAll(() => {
  actual = JSON.parse(execFileSync(NODE, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/stateful-oracle.ts', import.meta.url)), '--run-stateful'], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env },
  })) as Record<string, unknown>
}, 120_000)
for (const scenario of STATEFUL_SCENARIOS) {
  it(`stateful OLD/NEW parity: ${scenario}`, () => {
    expect(actual[scenario]).toEqual(expected[scenario])
  }, 120_000)
}
