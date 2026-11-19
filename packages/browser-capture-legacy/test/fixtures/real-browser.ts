import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

// The real-browser cases launch Chromium on an Xvfb display and record it with ffmpeg. They run
// inside a fresh network namespace that has no interface but loopback, so neither the page nor the
// browser's own background services can reach the network. A host without the programs or without
// unprivileged namespaces (hosted CI) skips the cases with the reason; the local gate runs them.
// The layout expectations were recorded on one Chromium build (fixtures/audit-chromium-version.json):
// a host with another build skips too, so a routine browser update asks for a re-characterization
// instead of failing unrelated work. VIDBEE_REQUIRE_REAL_BROWSER=1 turns every skip into a failure.
const programs = ['/usr/bin/chromium', '/usr/bin/ffmpeg', '/usr/bin/ffprobe', '/usr/bin/Xvfb', '/usr/bin/unshare', '/tmp']
const isolation = ['--pid', '--fork', '--kill-child=SIGKILL', '-n', '-U', `--map-user=${process.getuid?.() ?? 0}`, `--map-group=${process.getgid?.() ?? 0}`]
const missing = programs.filter((file) => !existsSync(file))
const namespaces =
  missing.length > 0 || spawnSync('/usr/bin/unshare', [...isolation, '/usr/bin/true'], { timeout: 10_000 }).status === 0

const characterized: unknown = JSON.parse(readFileSync(new URL('./audit-chromium-version.json', import.meta.url), 'utf8'))
const installed =
  missing.length > 0 ? '' : spawnSync('/usr/bin/chromium', ['--version'], { encoding: 'utf8', timeout: 10_000 }).stdout.trim()

export const REAL_BROWSER_SKIP: string | false =
  missing.length > 0
    ? `real-browser capture needs ${missing.join(', ')}`
    : !namespaces
      ? 'real-browser capture needs unprivileged network namespaces'
      : installed !== characterized
        ? `real-browser capture was characterized on ${String(characterized)}; this host has ${installed}`
        : false

/** Command and arguments that run `node` with `args` without network access. */
export const offline = (node: string, args: ReadonlyArray<string>): [string, Array<string>] => [
  '/usr/bin/unshare',
  [...isolation, node, ...args]
]

if (process.env.VIDBEE_REQUIRE_REAL_BROWSER === '1' && REAL_BROWSER_SKIP !== false) throw new Error(REAL_BROWSER_SKIP)
