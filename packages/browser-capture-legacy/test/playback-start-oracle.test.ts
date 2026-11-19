import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
// Recorded against the unchanged pre-port player from the phase extraction. Counts are
// microtask turns relative to the first mocked host call; no wall-clock assertion is used.
it('preserves start/close host order, await timing and original error identity', () => {
  const result = spawnSync(NODE, ['--import', 'tsx', new URL('./fixtures/playback-start-oracle.mjs', import.meta.url).pathname], {encoding: 'utf8', timeout: 60000})
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(new URL('./fixtures/playback-start-oracle.json', import.meta.url), 'utf8')))
}, 90000)
