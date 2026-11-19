import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
const prefix = '__PROFILE_STATEFUL__'
const driver = fileURLToPath(new URL('./fixtures/profile-stateful-scenarios.mjs', import.meta.url))
const expected: unknown = JSON.parse(readFileSync(new URL('./fixtures/profile-stateful-scenarios.json', import.meta.url), 'utf8'))
describe('profile manager stateful differential oracle', () => {
  it('matches original public results, errors, snapshots, residue and controlled host traces', () => {
    const result = spawnSync(NODE, ['--import', 'tsx', driver], { encoding: 'utf8', timeout: 30000 })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    const line = result.stdout.split('\n').find(value => value.startsWith(prefix))
    expect(line).toBeDefined()
    const actual: unknown = JSON.parse(line?.slice(prefix.length) ?? 'null')
    expect(actual).toEqual(expected)
  }, 60000)
})
