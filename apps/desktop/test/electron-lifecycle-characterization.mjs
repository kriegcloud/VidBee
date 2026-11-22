// Run the production transport in an isolated fixture under the packaged Electron runtime.
// Usage: bun apps/desktop/test/electron-lifecycle-characterization.mjs <linux-unpacked> <new scratch dir>

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [buildArg, scratchArg] = process.argv.slice(2)
assert(buildArg && scratchArg, 'build and new scratch directory are required')
const build = path.resolve(buildArg)
const scratch = path.resolve(scratchArg)
const hash = () =>
  createHash('sha256')
    .update(readFileSync(path.join(build, 'resources/app.asar')))
    .digest('hex')
const before = hash()
mkdirSync(scratch)
const fixture = path.join(scratch, 'runtime')
execFileSync('cp', ['-a', '--reflink=auto', build, fixture])
rmSync(path.join(fixture, 'resources/app.asar'))
mkdirSync(path.join(fixture, 'resources/app'))
writeFileSync(
  path.join(fixture, 'resources/app/package.json'),
  JSON.stringify({ name: 'vidbee-transport-characterization', version: '0.0.0', main: 'main.cjs' })
)
execFileSync(
  'bun',
  [
    'build',
    '--target=node',
    '--format=cjs',
    '--external=electron',
    'apps/desktop/test/ElectronLifecycle.entry.ts',
    '--outfile',
    path.join(fixture, 'resources/app/main.cjs')
  ],
  { stdio: 'inherit' }
)
execFileSync(
  'bun',
  [
    'build',
    '--target=browser',
    '--format=iife',
    '--define',
    'process.env.NODE_ENV="development"',
    'apps/desktop/test/ReactLifecycle.fixture.mjs',
    '--outfile',
    path.join(fixture, 'resources/app/renderer.js')
  ],
  { stdio: 'inherit' }
)
writeFileSync(
  path.join(fixture, 'resources/app/react.html'),
  '<!doctype html><title>React transport fixture</title><script src="renderer.js"></script>'
)
execFileSync(
  'bash',
  ['apps/desktop/scripts/port/offline-launch.sh', fixture, path.join(scratch, 'run'), '15'],
  { stdio: 'inherit' }
)
const output = readFileSync(path.join(scratch, 'run/stdout.log'), 'utf8')
assert(output.includes('TRANSPORT_ELECTRON_LIFECYCLE_PASS'), output)
assert(!output.includes('TRANSPORT_ELECTRON_LIFECYCLE_FAIL'), output)
assert(output.includes('TRANSPORT_REACT_LIFECYCLE_PASS'), output)
assert.equal(hash(), before, 'packaged app.asar changed')
writeFileSync(
  path.join(scratch, 'result.json'),
  `${JSON.stringify(
    {
      passed: true,
      packagedAsarUnchanged: before,
      cases: [
        'reload mid-stream',
        'renderer crash mid-stream',
        'independent window',
        'new document generations',
        'React StrictMode replay',
        'actual RegistryProvider disposal',
        'HMR caller/callback/preload teardown'
      ]
    },
    null,
    2
  )}\n`
)
console.log('packaged Electron lifecycle characterization: 7 cases passed')
