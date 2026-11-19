import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { NODE } from './fixtures/node-runtime'
test('all public declarations mutually assign to the frozen pre-port closure', { timeout: 240000 }, () => {
  const result = spawnSync(NODE, [fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', fileURLToPath(new URL('../tsconfig.characterization.json', import.meta.url)), '--pretty', 'false'], { encoding: 'utf8', timeout: 180000 })
  assert.notEqual(result.error?.message.includes('ETIMEDOUT'), true, 'public declaration compiler exceeded 180-second child budget')
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
