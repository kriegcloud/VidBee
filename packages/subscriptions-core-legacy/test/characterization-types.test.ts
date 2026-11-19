import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it as test } from '@effect/vitest'
import getExePath from '@effect/tsgo/lib/getExePath'

// Expected compiler failures live outside real check includes and are always removed.
test('public QueueLinkSelector arrays reject mutation while element fields remain mutable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vidbee-subscription-types-'))
  const config = join(directory, 'tsconfig.json')
  const input = join(directory, 'negative.ts')
  try {
    writeFileSync(config, JSON.stringify({ extends: fileURLToPath(new URL('../tsconfig.characterization.json', import.meta.url)), compilerOptions: { paths: { '@vidbee/subscriptions-core-legacy/*': [fileURLToPath(new URL('../src/*', import.meta.url))] }, typeRoots: [fileURLToPath(new URL('../../../node_modules/@types', import.meta.url))] }, include: [input] }))
    writeFileSync(input, `import type { QueueLinkSelector } from '@vidbee/subscriptions-core-legacy/store'\ndeclare const selector: QueueLinkSelector\nselector.taskIds?.push('task')\nselector.items?.push({ subscriptionId: 'sub', itemId: 'item' })\nif (selector.taskIds) selector.taskIds[0] = 'changed'\nif (selector.items) selector.items[0] = { subscriptionId: 'changed', itemId: 'changed' }\nconst first = selector.items?.[0]\nif (first) { first.subscriptionId = 'allowed'; first.itemId = 'allowed' }\n`)
    const result = spawnSync(getExePath(), ['-p', config, '--pretty', 'false'], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    const diagnostics = [...result.stdout.matchAll(/error (TS\d+):/g)].map((match) => match[1])
    assert.deepEqual(diagnostics, ['TS2339', 'TS2339', 'TS2542', 'TS2542'])
    assert.equal(result.stderr, '')
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 120000)
