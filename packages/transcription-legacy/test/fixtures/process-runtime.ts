import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const expected = readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim().replace(/^v/, '')
const candidates = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => resolve(dir, 'node'))
const matching = candidates.find((candidate) => {
  if (!existsSync(candidate)) return false
  try { return execFileSync(candidate, ['--version'], { encoding: 'utf8' }).trim() === `v${expected}` } catch { return false }
})
if (!matching) throw new Error(`Missing pinned Node ${expected} on PATH`)
export const NODE = realpathSync(matching)
export const TSX = fileURLToPath(new URL('../../../../node_modules/tsx/dist/loader.mjs', import.meta.url))
export const workerArgs = ['--import', TSX, '--input-type=module', '-e', "import('@vidbee/transcription-legacy/worker')"]
export const executable = (dir: string, name: string, body: string): string => {
  const file = join(dir, name)
  writeFileSync(file, `#!${NODE}\n${body}\n`, { mode: 0o755 })
  return file
}
