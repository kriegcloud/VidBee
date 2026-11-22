import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { containedLaunch } from './containment.mjs'

const files = fs.readdirSync('scripts/desktop-foundation').filter(name => name.endsWith('.node.ts')).map(name => `scripts/desktop-foundation/${name}`)
const commands = [[process.execPath, '--import', 'tsx', '--test', ...files], ['bun', 'x', '--bun', 'vitest', 'run', 'scripts/desktop-foundation/foundation.test.mjs']]
const parent = process.env.TMPDIR ?? '/tmp'
const work = fs.mkdtempSync(path.join(parent, 'foundation-source-'))
fs.mkdirSync(path.join(work, 'tmp')); fs.mkdirSync(path.join(work, 'home'))
const bunProbe=spawnSync('bun',['-p','process.execPath'],{encoding:'utf8'})
if(bunProbe.status!==0)throw Error('Bun runtime discovery failed')
const bun=fs.realpathSync(bunProbe.stdout.trim()),runtimes=[path.dirname(bun)]
const runtimePath=[path.dirname(process.execPath),path.dirname(bun),'/usr/bin','/bin'].join(path.delimiter)
const probe = spawnSync('bwrap', containedLaunch(work, ['/usr/bin/true']), { encoding: 'utf8' })
const available = probe.status === 0
if (!available) console.log(`Source containment unavailable; negative tests may skip: ${probe.error?.message ?? probe.stderr.trim()}`)
try {
  for (const command of commands) {
    const result = available
      ? spawnSync('bwrap', containedLaunch(work, command, runtimes), { stdio: 'inherit', env: { ...process.env, PATH:runtimePath, HOME: path.join(work, 'home'), TMPDIR: path.join(work, 'tmp'), BUN_TMPDIR: path.join(work, 'tmp') } })
      : spawnSync(command[0], command.slice(1), { stdio: 'inherit' })
    if (result.status !== 0) process.exitCode = result.status ?? 1
    if (process.exitCode) break
  }
} finally {
  const trace=path.join(work,'tmp/foundation-import-trace.json')
  // The full import trace is a diagnostic, kept only on request.
  if(process.env.VIDBEE_FOUNDATION_TRACE&&fs.existsSync(trace))fs.copyFileSync(trace,process.env.VIDBEE_FOUNDATION_TRACE)
  fs.rmSync(work, { recursive: true, force: true }) }
