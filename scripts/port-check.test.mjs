import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { check } from './port-check.mjs'

test('ratchet catches each violation and honors only exact allowlist entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-port-'))
  const write = (file, text) => writeFileSync(join(root, file), text)
  try {
    mkdirSync(join(root, 'packages/demo/src/legacy'), { recursive: true })
    mkdirSync(join(root, 'standards'))
    write('packages/demo/tsconfig.json', '{"extends":"../../tsconfig.base.json"}')
    write('tsconfig.base.json', '{"compilerOptions":{"plugins":[{"overrides":[{}]}]}}')
    write('standards/effect-allowlist.jsonc', '[]')
    write('packages/demo/src/bad.ts', '// @effect-diagnostics next-line\nEffect.promise(f); Effect.tryPromise(f); Effect.runSync(e); ManagedRuntime.make(l)')
    write('packages/demo/src/io.driver.ts', 'Effect.tryPromise(f)')
    write('packages/demo/src/app.entry.ts', 'Effect.runSync(e)')
    write('packages/demo/src/legacy/node.ts', 'ManagedRuntime.make(l)')
    const result = check(root)
    assert.deepEqual([...new Set(result.violations.map((item) => item.rule))].sort(), ['diagnostics', 'overrides', 'promise', 'runtime'])
    assert.equal(result.violations.length, 6)
    write('packages/demo/src/rules.ts', [
      '// @ts-expect-error fixture',
      'const a = new Map(); const b = new Set()',
      "import http from 'node:http'",
      "import { z } from 'zod'"
    ].join('\n'))
    const standing = check(root).violations.filter((item) => item.file === 'packages/demo/src/rules.ts')
    assert.deepEqual(standing.map((item) => item.rule).sort(), ['native-collection', 'native-collection', 'node-http', 'suppression', 'zod'])
    write('packages/demo/src/rules.ts', 'export const fine = HashMap.empty()')
    write('standards/effect-allowlist.jsonc', '[{"file":"packages/demo/src/bad.ts","rule":"promise","reason":"fixture"}]')
    assert.equal(check(root).violations.length, 4)
    write('tsconfig.base.json', '{"compilerOptions":{"plugins":[{"overrides":[]}]}}')
    write('packages/demo/src/bad.ts', 'export const clean = true')
    assert.equal(check(root).violations.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
