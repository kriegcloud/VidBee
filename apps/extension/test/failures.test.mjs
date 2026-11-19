import { frozenOnly } from './entry-loader.mjs'
import { backgroundExpectation, backgroundLogCount } from './design-expectations.mjs'
import { expect, it } from '@effect/vitest'
import { runFixture } from './node-runtime.mjs'
import { readFileSync } from 'node:fs'
import { scenarios } from './failure-cases.mjs'

// Old engine text stays in the fixture for investigation. Only failure is contractual.
const policy = result => ({ ...result, failures: result.failures.map(error => error.engine ? { engine: true } : error) })
it('pins original detached failures and malformed-root control-flow boundaries in isolated Node', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/failures.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
  const results = scenarios.map(scenario => {
    const previous = expected.find(item => JSON.stringify(item.scenario) === JSON.stringify(scenario))
    const result = runFixture('failure-runner.mjs', JSON.stringify(scenario), old, (old || frozenOnly) ? 0 : backgroundLogCount(previous))
    return { scenario: JSON.parse(JSON.stringify(scenario)), ...result }
  })
  // Before the port: expect(results.map(policy)).toEqual(expected.map(policy))
  expect(results.map(policy)).toEqual(((old || frozenOnly) ? expected : expected.map(item => backgroundExpectation(item, expected.find(item => !('map' in item.scenario) && !item.scenario.failure)))).map(policy))
  }
}, 300000)

it('releases admission after initial read and malformed root failures as well as success', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/failure-repeats.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
    const results = expected.map(previous => ({ scenario: previous.scenario, ...runFixture('failure-runner.mjs', JSON.stringify(previous.scenario), old, (old || frozenOnly) ? 0 : backgroundLogCount(previous)) }))
    // Before the port: expect(results.map(policy)).toEqual(expected.map(policy))
    expect(results.map(policy)).toEqual(((old || frozenOnly) ? expected : expected.map(item => backgroundExpectation(item))).map(policy))
    for (const result of results) expect(result.trace.filter(item => item[0] === 'get').length).toBeGreaterThanOrEqual(2)
  }
}, 300000)
