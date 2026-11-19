import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { delimiter, join } from 'node:path'
// bunx --bun prepends a Bun node alias: explicitly find and verify pinned Node.
const expected = `v${readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim().replace(/^v/, '')}`
export const NODE = (() => {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, 'node')
    // No existence pre-check: a suite that replaces node:fs may hide real directories; a missing candidate fails to execute and is skipped.
    try { if (execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() === expected) return realpathSync(candidate) } catch { /* Keep searching past missing candidates and broken host shims. */ }
  }
  throw new Error(`Process fixtures require ${expected} on PATH`)
})()
