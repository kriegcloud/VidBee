import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { buildBrowserCaptureFixture } from './browser-capture-fixture.mjs'
import { buildFixture, buildLoopbackFixture } from './build-fixture.mjs'
import { capture } from './capture.mjs'
import { auditDns } from './dns-audit.mjs'
import { buildPhase8Fixture } from './phase8-fixture.mjs'
import { phase8Prerequisites } from './phase8-prerequisites.mjs'
import {
  cleanupSubscriptionsRestart,
  prepareSubscriptionsRestart
} from './subscriptions-core-restart-fixture.mjs'
import { verifyTranscriptionCpuBuild } from './transcription-cpu.mjs'
import { buildTranscriptionFixture } from './transcription-fixture.mjs'
import { verifyTranscriptionModels } from './transcription-models.mjs'
import { runTranscriptionSuite } from './transcription-run.mjs'

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
if (option('--models') && !args.includes('--loopback-only')) {
  await verifyTranscriptionModels(path.resolve(option('--models')))
  await runTranscriptionSuite({ args, scratch, script: fileURLToPath(import.meta.url) })
  process.exit(0)
}
if (
  ['--phase8-only', '--extension-api-only', '--cli-additions-only'].some((flag) =>
    args.includes(flag)
  )
) {
  const skipped = await phase8Prerequisites(build)
  if (skipped) {
    process.stdout.write(`${skipped}\n`)
    process.exit(0)
  }
}
await mkdir(scratch, { recursive: true })
const work = await mkdtemp(path.join(scratch, 'suite-'))
const launchScript = path.join(here, '../offline-launch.sh')
let active
const command = async (cmd, argv, options = {}) => {
  const result = await capture(cmd, argv, options)
  if (result.code !== 0) {
    throw new Error(
      `${cmd} exited ${result.code} (${result.signal})\n${result.stdout}\n${result.stderr}`
    )
  }
  return result.stdout
}
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
const launch = async (runDir, seed, profile) => {
  active = spawn(
    'bash',
    [
      launchScript,
      build,
      runDir,
      '900',
      seed ?? '',
      profile ?? '',
      path.join(here, 'browser-capture-display.sh')
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe']
    }
  )
  let failure = ''
  active.stderr.on('data', (data) => {
    failure += data
  })
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (active.exitCode !== null) {
      throw new Error(`Offline launch exited: ${failure}`)
    }
    try {
      const config = JSON.parse(await readFile(path.join(runDir, 'mcp.json'), 'utf8'))
      const descriptor = JSON.parse(await readFile(path.join(runDir, 'automation.json'), 'utf8'))
      if (config.url && descriptor.port) {
        const pid = (await readFile(path.join(runDir, 'namespace.pid'), 'utf8')).trim()
        await command(
          'nsenter',
          [
            '-t',
            pid,
            '-U',
            '-n',
            '--preserve-credentials',
            process.execPath,
            path.join(here, 'worker.mjs'),
            '--probe',
            runDir
          ],
          { timeoutMs: 10_000 }
        )
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
// The browser-capture selector runs inside the loopback family: it skips the boot, MCP and
// subscription cases exactly as --loopback-only does.
const extensionBrowserOnly = args.includes('--extension-browser-only')
const phase8Only = ['--phase8-only', '--extension-api-only', '--cli-additions-only'].some((flag) =>
  args.includes(flag)
)
const loopbackOnly =
  extensionBrowserOnly ||
  phase8Only ||
  args.includes('--loopback-only') ||
  args.includes('--browser-capture-only')
try {
  if (option('--models')) {
    const cpuBuild = await verifyTranscriptionCpuBuild(build)
    await writeFile(
      path.join(work, 'transcription-cpu-build.json'),
      JSON.stringify(cpuBuild, null, 2)
    )
  }
  const bootstrap = path.join(work, 'bootstrap')
  process.stdout.write(`Bootstrapping real schema (${work})\n`)
  await launch(bootstrap)
  await stop()
  const seed = path.join(work, 'seed')
  await cp(path.join(bootstrap, 'userdata'), seed, { recursive: true })
  await rm(path.join(seed, 'logs'), { recursive: true, force: true })
  const runDir = path.join(work, 'run')
  await buildFixture(seed, { pathRoot: path.join(runDir, 'userdata') })
  await buildPhase8Fixture(seed)
  await buildLoopbackFixture(seed, build, command)
  await buildBrowserCaptureFixture(seed, build, command)
  const models = option('--models')
  if (models) {
    const manifest = await verifyTranscriptionModels(path.resolve(models))
    await writeFile(path.join(work, 'transcription-models.json'), JSON.stringify(manifest, null, 2))
    await cp(path.resolve(models), path.join(seed, 'models'), { recursive: true })
    await buildTranscriptionFixture(seed, path.resolve(models), build, command)
  }
  const pid = await launch(runDir, seed)
  const workerArgs = [
    path.join(here, 'worker.mjs'),
    runDir,
    build,
    ...(args.includes('--update') ? ['--update'] : []),
    ...(extensionBrowserOnly ? ['--extension-browser-only'] : []),
    ...args.filter((arg) =>
      ['--phase8-only', '--extension-api-only', '--cli-additions-only'].includes(arg)
    ),
    ...(loopbackOnly ? ['--loopback-only'] : []),
    ...(args.includes('--subscriptions-only') ? ['--subscriptions-only'] : []),
    ...(args.includes('--browser-capture-only') ? ['--browser-capture-only'] : []),
    ...(args.includes('--transcription-contract-only') ? ['--transcription-contract-only'] : []),
    ...(option('--subset') ? ['--subset', option('--subset')] : []),
    ...(models ? ['--models', path.resolve(models)] : [])
  ]
  const output = await command(
    'nsenter',
    ['-t', pid, '-U', '-n', '--preserve-credentials', process.execPath, ...workerArgs],
    { env: process.env, timeoutMs: 720_000 }
  )
  process.stdout.write(output)
  await stop()
  if (!(phase8Only || extensionBrowserOnly)) {
    if (!loopbackOnly || args.includes('--subscriptions-only')) {
      await prepareSubscriptionsRestart(runDir)
    }
    const state = args.includes('--subscriptions-only')
      ? undefined
      : JSON.parse(await readFile(path.join(runDir, 'loopback/state.json'), 'utf8'))
    if (state) {
      await symlink(path.join(runDir, 'downloads'), state.alias)
    }
    try {
      const restartDir = path.join(work, 'restart')
      const restartPid = await launch(restartDir, undefined, path.join(runDir, 'userdata'))
      const restartOutput = await command('nsenter', [
        '-t',
        restartPid,
        '-U',
        '-n',
        '--preserve-credentials',
        process.execPath,
        path.join(here, 'worker.mjs'),
        restartDir,
        build,
        '--loopback-only',
        ...(args.includes('--subscriptions-only') ? ['--subscriptions-only'] : []),
        '--loopback-restart',
        runDir,
        ...(args.includes('--update') ? ['--update'] : []),
        ...(models ? ['--models', path.resolve(models)] : []),
        ...(args.includes('--transcription-contract-only')
          ? ['--transcription-contract-only']
          : []),
        ...(option('--subset') ? ['--subset', option('--subset')] : [])
      ])
      process.stdout.write(restartOutput)
    } finally {
      if (state) {
        await rm(state.alias, { force: true })
      }
    }
  }
  if (active && (active.exitCode !== null || active.signalCode !== null)) {
    throw new Error('Offline launcher exited unexpectedly before suite completion')
  }
  await stop()
  await auditDns(
    work,
    phase8Only || extensionBrowserOnly ? ['bootstrap', 'run'] : ['bootstrap', 'run', 'restart']
  )
  const result = { elapsedSeconds: (Date.now() - start) / 1000, build, work, status: 'passed' }
  await writeFile(path.join(work, 'result.json'), JSON.stringify(result, null, 2))
  process.stdout.write(
    `Golden suite passed in ${result.elapsedSeconds.toFixed(1)}s; evidence ${work}\n`
  )
} finally {
  await stop()
  if (extensionBrowserOnly) {
    await auditDns(work, ['bootstrap', 'run'])
  }
  if (!loopbackOnly || args.includes('--subscriptions-only')) {
    await cleanupSubscriptionsRestart(path.join(work, 'run'))
  }
}
