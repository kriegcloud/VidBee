import { fileURLToPath } from 'node:url'
import { isolated } from '../../../scripts/cli/characterization/isolation.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const result = isolated(['scripts/cli/characterization/verify-distribution.worker.mjs', root], 60000)
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
process.exitCode = result.status ?? 1
