import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from '@effect/vitest'
import { callbackScenarios } from './fixtures/callback-parity.js'
import { NODE } from './fixtures/node-runtime.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/callback-parity.json', import.meta.url), 'utf8')) as {
  provenance: { source: string; node: string }
  scenarios: Record<string, unknown>
}
const runner = fileURLToPath(new URL('./fixtures/callback-parity.node.ts', import.meta.url))
for (const name of callbackScenarios) {
  it(`callback parity against pre-port Node trace: ${name}`, () => {
    const stdout = execFileSync(NODE, ['--import', 'tsx', runner, name], {
      encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    expect(JSON.parse(stdout)).toEqual(fixture.scenarios[name])
  }, 120_000)
}
