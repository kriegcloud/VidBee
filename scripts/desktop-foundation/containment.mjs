import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const checkout = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
// Empty root: no home, /run, host /tmp, sockets or host procfs are inherited.
// Explicit read-only mounts supply system libraries/tools, configuration and selected inputs.
export function containedLaunch(work, command, inputs = []) {
  assert(path.isAbsolute(work) && path.basename(work).startsWith('foundation-'))
  const args = ['--die-with-parent', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-net',
    '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib', '/lib64',
    '--dir', '/etc', '--dir', '/run', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp']
  for (const file of ['/etc/ld.so.cache', '/etc/fonts', '/etc/localtime', '/etc/nsswitch.conf', '/etc/resolv.conf']) {
    if (fs.existsSync(file)) args.push('--ro-bind', file, file)
  }
  for (const input of [checkout, path.dirname(process.execPath), ...inputs]) {
    const real = fs.realpathSync(input)
    args.push('--ro-bind', real, input)
  }
  args.push('--bind', work, work, '--remount-ro', '/', '--chdir', checkout, '--', ...command)
  return args
}
