import { expect, it } from '@effect/vitest'
import { runFixture } from './node-runtime.mjs'
import { readFileSync } from 'node:fs'

it('query, first storage read and final storage read failures leave original loading UI and detach', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/popup-failures.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
  const results = ['query', 'read', 'final-read'].map(scenario => ({ scenario, ...runFixture('popup-failure-runner.mjs', scenario, old) }))
  expect(results).toEqual(expected)
  }
}, 300000)

it('malformed active error payloads retain old truthiness, engine failure and presentation', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/popup-error-values.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
  const results = [undefined, null, false, true, 0, 7, '', 'disk failure', [], {}].map(error => {
    const scenario = JSON.parse(JSON.stringify({ error }))
    const observation = runFixture('popup-failure-runner.mjs', JSON.stringify(scenario), old)
    return { scenario, ...observation }
  })
  const policy = records => records.map(record => ({ ...record, failures: record.failures.map(() => ({ engine: true })) }))
  expect(policy(results)).toEqual(policy(expected))
  }
}, 300000)

it('rendered Open Client assignment failure leaves UI and request trace unchanged after two fake seconds', () => {
  const { scenario, ...expected } = JSON.parse(readFileSync(new URL('fixtures/navigation-failure.json', import.meta.url), 'utf8'))
  for (const old of [true, false]) {
    const result = runFixture('popup-failure-runner.mjs', JSON.stringify(scenario), old)
    expect(result).toEqual(expected)
    expect(result.navigation).toEqual(['vidbee://'])
    expect(result.trace.filter(item => item[0] === 'send')).toEqual([])
    expect(result.trace.filter(item => item[0] === 'query')).toHaveLength(2)
    expect(result.failures).toHaveLength(1)
  }
}, 300000)
