import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it } from '@effect/vitest'
import getExePath from '@effect/tsgo/lib/getExePath'

it('public declarations remain mutually assignable to frozen legacy shapes', () => {
  const config = fileURLToPath(new URL('../tsconfig.characterization.json', import.meta.url))
  const result = spawnSync(getExePath(), ['-p', config, '--pretty', 'false'], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
}, 120_000)
