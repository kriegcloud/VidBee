import { strict as assert } from 'node:assert'
import { writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

// Compile rejected calls in a disposable fixture rather than suppressing errors in ported tests.
test('LiteralKit rejects invalid subset and match shapes', () => {
  const fixture = 'packages/schema/test/negative-types.ts'
  writeFileSync(fixture, `import { LiteralKit } from '../src/LiteralKit/index.js';
const Tier = LiteralKit(['free', 'pro', 'team']);
Tier.pick([]);
Tier.omit(['free', 'pro', 'team']);
const widened: ReadonlyArray<typeof Tier.Type> = ['free'];
Tier.omit(widened);
Tier.matchOrElse('free', { enterprise: () => 1 }, () => 0);
Tier.match('free', { free: () => 1, pro: () => 1, team: () => 1, enterprise: () => 1 });
`)
  try {
    const result = spawnSync('node_modules/.bin/tsrs', ['-p', 'packages/schema/tsconfig.test.json'], { encoding: 'utf8' })
    assert.equal(result.status, 2, result.stdout + result.stderr)
    for (const line of [3, 4, 6, 7, 8]) {
      assert.match(result.stdout, new RegExp(`negative-types\\.ts\\(${line},`))
    }
  } finally {
    rmSync(fixture, { force: true })
  }
})
