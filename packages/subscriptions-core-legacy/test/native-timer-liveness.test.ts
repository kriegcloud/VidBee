import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'

const runner = fileURLToPath(new URL('./fixtures/native-timer-liveness.node.ts', import.meta.url))
for (const mode of ['after', 'every', 'every-backward', 'every-forward', 'every-zero'] as const) {
  it(`native ${mode} keeps Node alive until firing and exits after release`, () => {
    const stdout = execFileSync(NODE, ['--import', 'tsx', runner, mode], {
      encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe']
    })
    expect(JSON.parse(stdout)).toEqual({
      mode,
      events: mode.startsWith('every')
        ? ['ready', 'fired', 'fired', 'released', 'beforeExit']
        : ['ready', 'fired', 'released', 'beforeExit']
    })
  }, 120_000)
}
