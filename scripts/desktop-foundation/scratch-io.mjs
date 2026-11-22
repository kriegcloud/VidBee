import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { containedLaunch } from './containment.mjs'

// Fresh boundary per request; only bytes cross stdout/stdin. No host pathname
// operation follows a candidate-controlled entry, including ancestor directories.
export function scratchIO(work) {
  const call = (operation, file, payload) => {
    const relative = path.relative(work, file)
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw Error('Scratch path outside owned root')
    const result = spawnSync('bwrap', containedLaunch(work, ['/usr/bin/python3', fileURLToPath(new URL('./scratch-io.py', import.meta.url)), work, operation, relative]), {
      input: payload === undefined ? undefined : JSON.stringify(payload), encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024
    })
    if (result.status !== 0) throw Error(`Contained scratch ${operation} failed: ${result.error?.message ?? result.stderr}`)
    return result.stdout
  }
  return {
    readFile: async (file, encoding) => { const bytes = Buffer.from(call('read', file), 'base64'); return encoding ? bytes.toString(encoding) : bytes },
    writeFile: async (file, data, options = {}) => { call('write', file, {data: Buffer.from(data).toString('base64'), mode: options.mode ?? 0o600}) },
    mkdir: async file => { call('mkdir', file) },
    access: async file => { call('access', file) }
  }
}
