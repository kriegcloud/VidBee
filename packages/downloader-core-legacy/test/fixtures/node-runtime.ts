import { execFileSync } from 'node:child_process'
import { realpathSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Process fixtures always use the repository's pinned Node, including under Bun Vitest.
export const NODE = realpathSync(execFileSync('which', ['node'], { encoding: 'utf8' }).trim())
const expected = readFileSync(fileURLToPath(new URL('../../../../.node-version', import.meta.url)), 'utf8').trim().replace(/^v/, '')
const actual = execFileSync(NODE, ['--version'], { encoding: 'utf8' }).trim().replace(/^v/, '')
if (actual !== expected) throw new Error(`Process fixtures require Node ${expected}; found ${actual}`)
export const nodeShebang = `#!${NODE}`
