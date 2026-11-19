import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { delimiter, join } from 'node:path'
// bunx --bun prepends a Bun node alias: explicitly find and verify pinned Node.
const expected = `v${readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim().replace(/^v/, '')}`
export const NODE = (() => {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, 'node')
    if (!existsSync(candidate)) continue
    try { if (execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() === expected) return realpathSync(candidate) } catch { /* Keep searching past broken host shims. */ }
  }
  throw new Error(`Process fixtures require ${expected} on PATH`)
})()
