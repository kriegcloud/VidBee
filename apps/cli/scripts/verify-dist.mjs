import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { isolated } from '../../../scripts/cli/characterization/isolation.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const bun = spawnSync('bun', ['-p', 'process.execPath'], { encoding: 'utf8' })
if (bun.status !== 0) throw Error('Bun is required to pack and install the distribution')
const cache = spawnSync(bun.stdout.trim(), ['pm', 'cache'], { encoding: 'utf8' })
if (cache.status !== 0) throw Error('Bun cache is required for the offline install')
const result = isolated(['scripts/cli/characterization/verify-distribution.worker.mjs', root, realpathSync(bun.stdout.trim()), cache.stdout.trim(), join(homedir(), '.bun/install/cache')], 180000)
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
process.exitCode = result.status ?? 1
