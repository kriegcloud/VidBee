import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { buildFixture } from './build-fixture.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const build = path.resolve(
  option('--build') ??
    args.find((arg, i) => !arg.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--'))) ??
    path.join(root, 'apps/desktop/dist/linux-unpacked')
)
const scratch = path.resolve(
  option('--scratch') ??
    process.env.VIDBEE_GOLDEN_SCRATCH ??
    path.join(process.env.RUNNER_TEMP ?? path.join(homedir(), '.cache'), 'vidbee-goldens')
)
await mkdir(scratch, { recursive: true })
const work = await mkdtemp(path.join(scratch, 'suite-'))
const launchScript = path.join(here, '../offline-launch.sh')
let active
const command = (cmd, argv, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${cmd} exited ${code}\n${stdout}\n${stderr}`))
    )
  })
const stop = async () => {
  if (!active) {
    return
  }
  const child = active
  active = undefined
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  const ended = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await ended
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await stop()
    process.exit(1)
  })
}
const launch = async (runDir, seed) => {
  active = spawn('bash', [launchScript, build, runDir, '900', ...(seed ? [seed] : [])], {
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let failure = ''
  active.stderr.on('data', (data) => {
    failure += data
  })
  for (let i = 0; i < 1800; i++) {
    if (active.exitCode !== null) {
      throw new Error(`Offline launch exited: ${failure}`)
    }
    try {
      const config = JSON.parse(await readFile(path.join(runDir, 'mcp.json'), 'utf8'))
      const descriptor = JSON.parse(await readFile(path.join(runDir, 'automation.json'), 'utf8'))
      if (config.url && descriptor.port) {
        const pid = (await readFile(path.join(runDir, 'namespace.pid'), 'utf8')).trim()
        await command('nsenter', [
          '-t',
          pid,
          '-U',
          '-n',
          '--preserve-credentials',
          process.execPath,
          path.join(here, 'worker.mjs'),
          '--probe',
          runDir
        ])
        return pid
      }
    } catch {
      /* readiness includes a real initialized MCP request */
    }
    await delay(100)
  }
  throw new Error(`Offline readiness timed out: ${failure}`)
}
const start = Date.now()
try {
  const bootstrap = path.join(work, 'bootstrap')
  process.stdout.write(`Bootstrapping real schema (${work})\n`)
  await launch(bootstrap)
  await stop()
  const seed = path.join(work, 'seed')
  await cp(path.join(bootstrap, 'userdata'), seed, { recursive: true })
  await rm(path.join(seed, 'logs'), { recursive: true, force: true })
  const runDir = path.join(work, 'run')
  await buildFixture(seed, { pathRoot: path.join(runDir, 'userdata') })
  const models = option('--models')
  if (models) {
    await cp(path.resolve(models), path.join(seed, 'models'), { recursive: true })
  }
  const pid = await launch(runDir, seed)
  const workerArgs = [
    path.join(here, 'worker.mjs'),
    runDir,
    build,
    ...(args.includes('--update') ? ['--update'] : []),
    ...(option('--subset') ? ['--subset', option('--subset')] : []),
    ...(models ? ['--models', path.resolve(models)] : [])
  ]
  const output = await command(
    'nsenter',
    ['-t', pid, '-U', '-n', '--preserve-credentials', process.execPath, ...workerArgs],
    { env: process.env }
  )
  process.stdout.write(output)
  if (active.exitCode !== null || active.signalCode !== null) {
    throw new Error('Offline launcher exited unexpectedly before suite completion')
  }
  const result = { elapsedSeconds: (Date.now() - start) / 1000, build, work, status: 'passed' }
  await writeFile(path.join(work, 'result.json'), JSON.stringify(result, null, 2))
  process.stdout.write(
    `Golden suite passed in ${result.elapsedSeconds.toFixed(1)}s; evidence ${work}\n`
  )
} finally {
  await stop()
}
