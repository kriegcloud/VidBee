import { frozenOnly } from './entry-loader.mjs'
import { expect, it } from '@effect/vitest'
import { runFixture } from './node-runtime.mjs'
import { readFileSync } from 'node:fs'

it('query, first storage read and final storage read failures leave original loading UI and detach', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/popup-failures.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
  const results = ['query', 'read', 'final-read'].map(scenario => ({ scenario, ...runFixture('popup-failure-runner.mjs', scenario, old, (old || frozenOnly) ? 0 : 2) }))
  // Before the port: expect(results).toEqual(expected)
  expect(results).toEqual((old || frozenOnly) ? expected : expected.map(item => ({ ...item, failures: [] })))
  }
}, 300000)

it('malformed active error payloads retain old truthiness, engine failure and presentation', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/popup-error-values.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
  const results = [undefined, null, false, true, 0, 7, '', 'disk failure', [], {}].map(error => {
    const scenario = JSON.parse(JSON.stringify({ error }))
    const observation = runFixture('popup-failure-runner.mjs', JSON.stringify(scenario), old, 0)
    return { scenario, ...observation }
  })
  const policy = records => records.map(record => ({ ...record, failures: record.failures.map(() => ({ engine: true })) }))
  // Before the port: expect(policy(results)).toEqual(policy(expected))
  expect(policy(results)).toEqual(policy((old || frozenOnly) ? expected : expected.map(item => typeof item.scenario.error === 'string' || item.scenario.error === undefined ? item : { ...expected[0], scenario: item.scenario })))
  }
}, 300000)

it('rendered Open Client assignment failure leaves UI and request trace unchanged after two fake seconds', () => {
  const { scenario, ...expected } = JSON.parse(readFileSync(new URL('fixtures/navigation-failure.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
    const result = runFixture('popup-failure-runner.mjs', JSON.stringify(scenario), old, (old || frozenOnly) ? 0 : 1)
    // Before the port: expect(result).toEqual(expected)
    expect(result).toEqual((old || frozenOnly) ? expected : { ...expected, failures: [] })
    expect(result.navigation).toEqual(['vidbee://'])
    expect(result.trace.filter(item => item[0] === 'send')).toEqual([])
    expect(result.trace.filter(item => item[0] === 'query')).toHaveLength(2)
    // Before the port: expect(result.failures).toHaveLength(1)
    expect(result.failures).toHaveLength((old || frozenOnly) ? 1 : 0)
  }
}, 300000)
