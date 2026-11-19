import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
for (const scenario of ['playback-playing', 'playback-chat', 'profile-executor']) {
  it(`${scenario} retains the pre-port callback values and microtask trace`, () => {
    const result = spawnSync(NODE, ['--import', 'tsx', new URL(`./fixtures/${scenario}-oracle.mjs`, import.meta.url).pathname], {encoding: 'utf8', timeout: 60000})
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(new URL(`./fixtures/${scenario}-oracle.json`, import.meta.url), 'utf8')))
  }, 90000)
}
