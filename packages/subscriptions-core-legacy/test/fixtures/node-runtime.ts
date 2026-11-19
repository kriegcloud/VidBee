import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// bunx --bun prepends a Bun-owned node alias. Check every candidate, not `which node`.
const expected = readFileSync(fileURLToPath(new URL('../../../../.node-version', import.meta.url)), 'utf8').trim().replace(/^v/, '')
const candidates = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((directory) => join(directory, 'node'))
const resolveNode = (): string => {
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      if (execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === `v${expected}`) return realpathSync(candidate)
    } catch { /* A nonexecutable PATH entry is not a matching runtime. */ }
  }
  throw new Error(`Characterization requires pinned Node ${expected} on PATH`)
}
export const NODE = resolveNode()
