import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// The real-browser cases launch Chromium on an Xvfb display and record it with ffmpeg. They run
// inside a fresh network namespace that has no interface but loopback, so neither the page nor the
// browser's own background services can reach the network. A host without the programs or without
// unprivileged namespaces (hosted CI) skips the cases with the reason; the local gate runs them.
const programs = ['/usr/bin/chromium', '/usr/bin/ffmpeg', '/usr/bin/ffprobe', '/usr/bin/Xvfb', '/usr/bin/unshare', '/tmp']
const isolation = ['-n', '-U', `--map-user=${process.getuid?.() ?? 0}`, `--map-group=${process.getgid?.() ?? 0}`]
const missing = programs.filter((file) => !existsSync(file))
const namespaces =
  missing.length > 0 || spawnSync('/usr/bin/unshare', [...isolation, '/usr/bin/true'], { timeout: 10_000 }).status === 0

export const REAL_BROWSER_SKIP: string | false =
  missing.length > 0
    ? `real-browser capture needs ${missing.join(', ')}`
    : namespaces
      ? false
      : 'real-browser capture needs unprivileged network namespaces'

/** Command and arguments that run `node` with `args` without network access. */
export const offline = (node: string, args: ReadonlyArray<string>): [string, Array<string>] => [
  '/usr/bin/unshare',
  [...isolation, node, ...args]
]
