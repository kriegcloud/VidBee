import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
// Old results retain complete callback/public-reader ordering and raw signal requests.
// The two windows re-enter TaskQueueAPI before the executor returns and from onSpawn.
it('preserves pause, cancel and synchronous finish in all three executor start windows', () => {
  const result = spawnSync(NODE, ['--import', 'tsx', new URL('./fixtures/executor-queue-window-oracle.mjs', import.meta.url).pathname], {encoding: 'utf8', timeout: 60000})
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(new URL('./fixtures/executor-queue-window-oracle.json', import.meta.url), 'utf8')))
}, 90000)
