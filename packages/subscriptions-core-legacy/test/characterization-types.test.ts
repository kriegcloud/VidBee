import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it as test } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime'

// Expected compiler failures live outside real check includes and are always removed.
test('public QueueLinkSelector arrays reject mutation while element fields remain mutable', { timeout: 240000 }, () => {
  const directory = mkdtempSync(fileURLToPath(new URL('./.audit-types-', import.meta.url)))
  const config = join(directory, 'tsconfig.json')
  const input = join(directory, 'negative.ts')
  try {
    writeFileSync(config, JSON.stringify({ extends: fileURLToPath(new URL('../tsconfig.characterization.json', import.meta.url)), compilerOptions: { typeRoots: [fileURLToPath(new URL('../../../node_modules/@types', import.meta.url))] }, include: [input] }))
    writeFileSync(input, `import type { QueueLinkSelector } from '@vidbee/subscriptions-core-legacy/store'\ndeclare const selector: QueueLinkSelector\nselector.taskIds?.push('task')\nselector.items?.push({ subscriptionId: 'sub', itemId: 'item' })\nif (selector.taskIds) selector.taskIds[0] = 'changed'\nif (selector.items) selector.items[0] = { subscriptionId: 'changed', itemId: 'changed' }\nconst first = selector.items?.[0]\nif (first) { first.subscriptionId = 'allowed'; first.itemId = 'allowed' }\n`)
    const result = spawnSync(NODE, [fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', config, '--pretty', 'false'], { encoding: 'utf8', timeout: 180000 })
    assert.notEqual(result.error?.message.includes('ETIMEDOUT'), true, 'public type compiler exceeded 180-second child budget')
    assert.equal(result.error, undefined)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    const diagnostics = [...result.stdout.matchAll(/error (TS\d+):/g)].map((match) => match[1])
    assert.deepEqual(diagnostics, ['TS2339', 'TS2339', 'TS2542', 'TS2542'])
    assert.equal(result.stderr, '')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
