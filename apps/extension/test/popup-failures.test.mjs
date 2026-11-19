import { expect, it } from '@effect/vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

it('query, first storage read and final storage read failures leave original loading UI and detach', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/popup-failures.json', import.meta.url), 'utf8'))
  const results = ['query', 'read', 'final-read'].map(scenario => ({ scenario, ...JSON.parse(execFileSync('node', [new URL('popup-failure-runner.mjs', import.meta.url).pathname, scenario], { encoding: 'utf8', timeout: 10000 })) }))
  expect(results).toEqual(expected)
}, 120000)

it('malformed active error payloads retain old truthiness, engine failure and presentation', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/popup-error-values.json', import.meta.url), 'utf8'))
  const results = [undefined, null, false, true, 0, 7, '', 'disk failure', [], {}].map(error => {
    const scenario = JSON.parse(JSON.stringify({ error }))
    const observation = JSON.parse(execFileSync('node', [new URL('popup-failure-runner.mjs', import.meta.url).pathname, JSON.stringify(scenario)], { encoding: 'utf8', timeout: 10000 }))
    return { scenario, ...observation }
  })
  const policy = records => records.map(record => ({ ...record, failures: record.failures.map(() => ({ engine: true })) }))
  expect(policy(results)).toEqual(policy(expected))
}, 120000)
