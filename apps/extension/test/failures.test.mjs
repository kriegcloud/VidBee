import { expect, it } from '@effect/vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { scenarios } from './failure-cases.mjs'

// Old engine text stays in the fixture for investigation. Only failure is contractual.
const policy = result => ({ ...result, failures: result.failures.map(error => error.engine ? { engine: true } : error) })
it('pins original detached failures and malformed-root control-flow boundaries in isolated Node', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/failures.json', import.meta.url), 'utf8'))
  const results = scenarios.map(scenario => {
    const result = JSON.parse(execFileSync('node', [new URL('failure-runner.mjs', import.meta.url).pathname, JSON.stringify(scenario)], { encoding: 'utf8', timeout: 10000 }))
    return { scenario: JSON.parse(JSON.stringify(scenario)), ...result }
  })
  expect(results.map(policy)).toEqual(expected.map(policy))
}, 120000)
