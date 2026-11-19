import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
// Resolve the executable, not Bun's transient node alias; verify the repository pin.
export const expectedNode = readFileSync(new URL('../../../.node-version', import.meta.url), 'utf8').trim().replace(/^v/, '')
const candidates = execFileSync('which', ['-a', 'node'], { encoding: 'utf8' }).trim().split('\n')
export const NODE = candidates.map(candidate => realpathSync(candidate)).find(candidate => {
  try { return execFileSync(candidate, ['--version'], { encoding: 'utf8' }).trim() === `v${expectedNode}` }
  catch { return false }
})
if (!NODE) throw new Error(`Process fixtures require pinned Node ${expectedNode}; no matching executable on PATH`)
export function runFixture(runner, scenario, old, expectedLogs) {
  const result = JSON.parse(execFileSync(NODE, [new URL(runner, import.meta.url).pathname, scenario, old ? 'old' : 'current'], { encoding: 'utf8', timeout: 30000 }))
  if (result.node !== expectedNode) throw new Error('Runner did not execute pinned Node')
  if (!old && result.currentObservations < 1) throw new Error('Runner did not load current entry points')
  if (result.networkRefusals.length) throw new Error('Runner attempted real network access')
  if (expectedLogs !== undefined && result.loggedFailures !== expectedLogs) throw new Error(`Expected ${expectedLogs} logged failures, received ${result.loggedFailures}`)
  const { node, currentObservations, networkRefusals, loggedFailures, ...observation } = result
  return observation
}
