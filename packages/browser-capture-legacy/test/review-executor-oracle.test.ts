import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
it('retains old scalar options, live configuration, receivers, BOMs and callback escapes', () => {
  const result = spawnSync(NODE, ['--import', 'tsx', new URL('./fixtures/review-executor-oracle.mjs', import.meta.url).pathname], { encoding: 'utf8', timeout: 60000 })
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(new URL('./fixtures/review-executor-oracle.json', import.meta.url), 'utf8')))
}, 90000)
for (const fixture of ['review-process-text-oracle', 'review-import-oracle']) it(`preserves old ${fixture} observations`, () => {
  const result = spawnSync(NODE, ['--import', 'tsx', new URL(`./fixtures/${fixture}.mjs`, import.meta.url).pathname], { encoding: 'utf8', timeout: 60000 })
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(new URL(`./fixtures/${fixture}.json`, import.meta.url), 'utf8')))
}, 90000)
