import assert from 'node:assert/strict'
import path from 'node:path'

// Bind only the fresh owned suite directory writable. Root, build, checkout,
// owner profiles and symlink destinations stay read-only in the inherited mount
// namespace. /tmp and /dev are private runtime mounts, never host write routes.
export function containedLaunch(work, command) {
  assert(path.isAbsolute(work) && path.basename(work).startsWith('foundation-'))
  return ['--die-with-parent', '--ro-bind', '/', '/', '--bind', work, work,
    '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--', ...command]
}
