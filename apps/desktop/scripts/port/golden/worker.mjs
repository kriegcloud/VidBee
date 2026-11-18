import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MCP_READ_TOOLS, runCases } from './cases.mjs'
import { runCliCases } from './cli.mjs'
import { createClient } from './client.mjs'
import { runLoopbackCases, runLoopbackRestart } from './loopback-cases.mjs'
import { differences, normalize } from './normalize.mjs'

const args = process.argv.slice(2)
const probe = args[0] === '--probe'
const runDir = args[probe ? 1 : 0]
const build = args[1]
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const client = createClient(runDir)
await client.rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'vidbee-golden', version: '1' }
})
await client.rpc('notifications/initialized', {}, true)
if (probe) {
  await client.rpc('tools/list')
  process.exit(0)
}
const subsetIndex = args.indexOf('--subset')
const subset = subsetIndex < 0 ? '' : args[subsetIndex + 1]
const output = path.join(root, 'apps/desktop/test/golden')
const actualDir = path.join(runDir, 'actual')
await mkdir(actualDir, { recursive: true })
await mkdir(output, { recursive: true })
let count = 0
let failures = 0
const roots = [
  [runDir, '<run>'],
  [path.dirname(runDir), '<work>'],
  [build, '<build>'],
  [root, '<repo>']
]
const record = async (name, value) => {
  if (subset && !name.includes(subset)) {
    return
  }
  const actual = normalize(value, roots)
  const file = `${name.replaceAll('/', '--')}.json`
  const text = `${JSON.stringify(actual, null, 2)}\n`
  await writeFile(path.join(actualDir, file), text)
  count++
  if (args.includes('--update')) {
    await writeFile(path.join(output, file), text)
    return
  }
  let expected
  try {
    expected = JSON.parse(await readFile(path.join(output, file), 'utf8'))
  } catch {
    failures++
    process.stdout.write(`FAIL ${name}: missing golden\n`)
    return
  }
  const changes = differences(expected, actual)
  if (changes.length) {
    failures++
    process.stdout.write(`FAIL ${name}\n${changes.slice(0, 30).join('\n')}\n`)
  }
}
if (!args.includes('--loopback-only')) {
  const listing = await client.rpc('tools/list')
  await record('mcp/tools-list', listing)
  const missingReads = listing.result.tools.filter(
    (tool) => tool.annotations?.readOnlyHint && !MCP_READ_TOOLS.includes(tool.name)
  )
  if (missingReads.length) {
    throw new Error(
      `Read tools require new cases: ${missingReads.map((tool) => tool.name).join(', ')}`
    )
  }
  for (const auth of ['none', 'bad']) {
    await record(
      `mcp/auth/${auth}`,
      await client.http(
        'POST',
        '/mcp',
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        auth
      )
    )
  }
}
const mcp = client.mcp
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
    child.on('exit', (code) => resolve({ code, stdout, stderr }))
  })
if (!args.includes('--loopback-only')) {
  const renderer = await command(process.execPath, [
    path.join(here, '../cdp-shots.mjs'),
    path.join(runDir, 'screenshots')
  ])
  if (renderer.code !== 0) {
    throw new Error(`Renderer smoke failed ${renderer.stdout} ${renderer.stderr}`)
  }
  await record('renderer/smoke', JSON.parse(renderer.stdout))
  const log = await readFile(path.join(runDir, 'userdata/logs/main.log'), 'utf8')
  const required = [
    'database initialized at',
    'ffmpeg initialized successfully',
    'Extension API listening on',
    'Automation descriptor written at',
    'Desktop MCP available at'
  ]
  const expectedOfflineErrors = [
    'Using fallback thinking options: TypeError: fetch failed',
    'Failed to cache thumbnail: TypeError: fetch failed'
  ]
  const boot = {
    lines: required.map((line) => ({ line, present: log.includes(line) })),
    errors: log
      .split('\n')
      .filter(
        (line) =>
          line.includes('[error]') &&
          !expectedOfflineErrors.some((expected) => line.includes(expected))
      )
  }
  if (boot.lines.some((line) => !line.present) || boot.errors.length) {
    throw new Error(`Unexpected boot log: ${JSON.stringify(boot)}`)
  }
  await runCases({ mcp, http: client.http, profileDir: path.join(runDir, 'userdata'), record })
  await runCliCases({ runDir, record, command })
  const finalLog = await readFile(path.join(runDir, 'userdata/logs/main.log'), 'utf8')
  const unexpectedErrors = finalLog
    .split('\n')
    .filter(
      (line) =>
        line.includes('[error]') &&
        !expectedOfflineErrors.some((expected) => line.includes(expected))
    )
  if (unexpectedErrors.length) {
    throw new Error(`Unexpected application errors: ${JSON.stringify(unexpectedErrors)}`)
  }
  await record('boot/log', boot)
  await client.rpc('tools/list')
}
const restartIndex = args.indexOf('--loopback-restart')
if (restartIndex >= 0) {
  await runLoopbackRestart({ client, runDir, originalRun: args[restartIndex + 1], record, roots })
} else {
  await runLoopbackCases({ client, runDir, build, record, roots, command })
}
if (!args.includes('--models')) {
  process.stdout.write('SKIP local ASR golden: --models not supplied\n')
}
process.stdout.write(
  `${args.includes('--update') ? 'Recorded' : 'Compared'} ${count} cases; ${failures} failures\n`
)
if ((count === 0 && restartIndex < 0) || failures) {
  process.exitCode = 1
}
