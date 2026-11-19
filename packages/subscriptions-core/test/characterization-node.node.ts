import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { NODE } from './fixtures/node-runtime'

const scenarioPath = fileURLToPath(new URL('./fixtures/node-scenarios.ts', import.meta.url))
const run = (scenario: string, timezone = 'UTC'): unknown => JSON.parse(execFileSync(NODE, ['--import', 'tsx', scenarioPath, scenario], { encoding: 'utf8', env: { ...process.env, TZ: timezone }, timeout: 60000 }))
for (const scenario of ['api-ledger', 'timing', 'network-cancel', 'skip-logger', 'malformed', 'parse-abort', 'candidate-abort', 'heartbeat', 'tick-logger', 'pending-logger', 'rearm', 'finally-precedence', 'removal', 'liveness']) test(`pinned Node oracle: ${scenario}`, { timeout: 120000 }, () => {
  const actual = run(scenario)
  const fixture = new URL(`./fixtures/node-${scenario}.json`, import.meta.url)
  assert.deepEqual(actual, JSON.parse(readFileSync(fixture, 'utf8')))
})
for (const timezone of ['UTC', 'Asia/Tokyo']) test(`pinned Node date/coercion oracle: ${timezone}`, { timeout: 120000 }, () => {
  const actual = run('dates', timezone)
  const fixture = new URL(`./fixtures/node-dates-${timezone.replace('/', '-')}.json`, import.meta.url)
  assert.deepEqual(actual, JSON.parse(readFileSync(fixture, 'utf8')))
})
