import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { startBrowserCaptureLoopback } from './browser-capture-loopback.mjs'
import { createClient } from './client.mjs'
import { differences, normalize } from './normalize.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const args = process.argv.slice(2)
const option = (key) => args[args.indexOf(key) + 1]

// The worker is explicitly inside the launcher's offline namespace.
if (args[0] === '--worker') {
  const runDir = args[1]
  const client = createClient(runDir)
  const server = await startBrowserCaptureLoopback(runDir)
  let stream
  const raw = []
  try {
    await client.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'capture-unavailable', version: '1' }
    })
    await client.rpc('notifications/initialized', {}, true)
    stream = await client.events()
    const admission = await client.http('POST', '/automation/v1/add', {
      input: {
        kind: 'video',
        url: `${server.url}/drm.html`,
        title: 'browser-capture-unavailable',
        options: { type: 'video', customDownloadPath: path.join(runDir, 'downloads') }
      }
    })
    raw.push({ admission })
    const id = admission.body?.id
    if (!id) {
      throw new Error('Unavailable characterization admission failed')
    }
    const deadline = Date.now() + 90_000
    let task
    while (Date.now() < deadline) {
      const response = await client.mcp('get_task', { id })
      raw.push({ response })
      task = response.result?.structuredContent?.result
      if (
        task &&
        ['failed', 'retry-scheduled', 'completed'].includes(task.status) &&
        stream.values.some(
          (event) => event.type === 'transition' && event.taskId === id && event.to === task.status
        )
      ) {
        break
      }
      await delay(50)
    }
    if (!(task && ['failed', 'retry-scheduled', 'completed'].includes(task.status))) {
      throw new Error('Unavailable characterization deadline')
    }
    const { progress, log, ...fields } = task
    const history = await client.mcp('list_download_history', { query: task.url })
    const value = {
      task: { ...fields, progressFields: Object.keys(progress) },
      statuses: stream.values
        .filter((event) => event.type === 'transition' && event.taskId === id)
        .map((event) => event.to),
      history: history.result.structuredContent.result.items.filter((item) => item.id === id),
      browserMediaRequested: server.requests.some((request) => request.path === '/silent.mp4'),
      captureStarted: log?.includes('ffmpeg x11grab started') ?? false,
      configuration: { VIDBEE_BROWSER_CAPTURE: '0' }
    }
    await writeFile(
      path.join(runDir, 'browser-capture/unavailable-value.json'),
      JSON.stringify(value, null, 2)
    )
  } finally {
    await writeFile(path.join(runDir, 'browser-capture/raw.json'), JSON.stringify(raw, null, 2))
    await writeFile(
      path.join(runDir, 'browser-capture/events.json'),
      JSON.stringify(stream?.values ?? [], null, 2)
    )
    try {
      await stream?.close()
    } finally {
      await server.close()
    }
  }
  process.exit(0)
}
const build = path.resolve(option('--build'))
const scratch = path.resolve(option('--scratch'))
const seed = path.resolve(option('--seed'))
// This companion consumes the primary harness's synthetic seed, never a live profile.
await readFile(path.join(seed, 'browser-capture-fixtures/landscape.mp4'))
await mkdir(scratch, { recursive: true })
const work = await mkdtemp(path.join(scratch, 'unavailable-'))
const runDir = path.join(work, 'run')
const launcher = spawn(
  'bash',
  [
    path.join(here, '../offline-launch.sh'),
    build,
    runDir,
    '180',
    seed,
    '',
    path.join(here, 'browser-capture-unavailable.sh')
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
)
let errorText = ''
launcher.stderr.on('data', (data) => {
  errorText += data
})
try {
  let pid
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (launcher.exitCode !== null) {
      throw new Error(`Unavailable launch failed: ${errorText}`)
    }
    try {
      await readFile(path.join(runDir, 'mcp.json'))
      await readFile(path.join(runDir, 'automation.json'))
      pid = (await readFile(path.join(runDir, 'namespace.pid'), 'utf8')).trim()
      break
    } catch {
      await delay(50)
    }
  }
  if (!pid) {
    throw new Error('Unavailable launch readiness deadline')
  }
  await new Promise((resolve, reject) => {
    const worker = spawn(
      'nsenter',
      [
        '-t',
        pid,
        '-U',
        '-n',
        '--preserve-credentials',
        process.execPath,
        fileURLToPath(import.meta.url),
        '--worker',
        runDir
      ],
      { stdio: 'inherit' }
    )
    worker.once('error', reject)
    worker.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Unavailable worker exited ${code}`))
    )
  })
  const actual = normalize(
    JSON.parse(await readFile(path.join(runDir, 'browser-capture/unavailable-value.json'), 'utf8')),
    [
      [runDir, '<run>'],
      [work, '<work>'],
      [build, '<build>'],
      [root, '<repo>']
    ]
  )
  const golden = path.join(root, 'apps/desktop/test/golden/browser-capture--unavailable.json')
  if (args.includes('--update')) {
    await writeFile(golden, `${JSON.stringify(actual, null, 2)}\n`)
  } else {
    const changes = differences(JSON.parse(await readFile(golden, 'utf8')), actual)
    if (changes.length) {
      throw new Error(changes.join('\n'))
    }
  }
  await writeFile(
    path.join(work, 'result.json'),
    JSON.stringify({ status: 'passed', work, comparisons: 1 })
  )
  process.stdout.write(`Unavailable golden passed; evidence ${work}\n`)
} finally {
  if (launcher.exitCode === null && launcher.signalCode === null) {
    const ended = new Promise((resolve) => launcher.once('exit', resolve))
    launcher.kill('SIGTERM')
    await ended
  }
}
