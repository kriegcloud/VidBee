import assert from 'node:assert/strict'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../../../../cli/dist/index.mjs', import.meta.url))
const payload = (response) => response.result?.structuredContent?.result ?? response
const terminal = (task) =>
  ['completed', 'failed', 'cancelled', 'retry-scheduled'].includes(task.status)
const parse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
const snapshot = ({ progress, log, ...task }) => ({
  ...task,
  progressFields: Object.keys(progress ?? {})
})
export async function condition(check, description, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) {
      return value
    }
    await delay(25)
  }
  throw new Error(`Timed out: ${description}`)
}
export async function runCliAdditions({
  client,
  runDir,
  build,
  record,
  command,
  server,
  alias,
  raw
}) {
  const directory = path.join(runDir, 'phase8')
  const bin = path.join(directory, 'bin')
  await mkdir(bin, { recursive: true })
  const fake = path.join(bin, 'yt-dlp')
  await writeFile(
    fake,
    `#!${process.execPath}
const mode = process.env.GOLDEN_PROBE_MODE
if (mode === 'oversize') { process.stdout.on('error', () => {}); const b = Buffer.alloc(65536, 'x'); for (let i=0; i<600; i++) { if (!process.stdout.write(b)) await new Promise(r => process.stdout.once('drain', r)) } }
else { process.stdout.write(mode === 'version' ? '2025.01.01\\n' : 'golden-probe-output\\n'); process.stderr.write('golden-probe-stderr\\n'); process.exitCode = mode === 'nonzero' ? 7 : 0 }
`
  )
  await chmod(fake, 0o755)
  const env = {
    ...process.env,
    HOME: path.join(runDir, 'home'),
    XDG_CONFIG_HOME: path.join(runDir, 'home/.config'),
    XDG_CACHE_HOME: path.join(runDir, 'home/.cache'),
    XDG_DATA_HOME: path.join(runDir, 'home/.local/share'),
    XDG_STATE_HOME: path.join(runDir, 'home/.local/state'),
    XDG_RUNTIME_DIR: path.join(runDir, 'home/.cache'),
    TMPDIR: path.join(runDir, 'tmp'),
    VIDBEE_AUTOMATION_DESCRIPTOR: path.join(runDir, 'automation.json'),
    VIDBEE_MCP_CONFIG: path.join(runDir, 'mcp.json'),
    YTDLP_PATH: fake,
    FFMPEG_PATH: path.join(build, 'resources/resources/ffmpeg'),
    PATH: `${bin}:${process.env.PATH}`
  }
  env.VIDBEE_API = undefined
  env.VIDBEE_TOKEN = undefined
  env.NODE_OPTIONS = undefined
  const invoke = async (args, extra = {}, nodeArgs = [], timeoutMs = 180_000) => {
    const output = await command(process.execPath, [...nodeArgs, cli, ...args], {
      env: { ...env, ...extra },
      timeoutMs
    })
    raw.push({ args, output })
    const value = {
      code: output.code,
      signal: output.signal,
      stdout: parse(output.stdout),
      stderr: parse(output.stderr)
    }
    if (value.stdout?.task?.progress) {
      value.stdout.task = snapshot(value.stdout.task)
    }
    return value
  }
  const run = async (name, args, extra, nodeArgs, timeoutMs) => {
    const value = await invoke(args, extra, nodeArgs, timeoutMs)
    await record(`cli-additions/${name}`, value)
    return value
  }
  const call = async (name, args) => {
    const response = await client.mcp(name, args)
    raw.push({ tool: name, args, response })
    if (response.error || response.result?.isError) {
      throw new Error(JSON.stringify(response))
    }
    return payload(response)
  }
  const get = (id) => call('get_task', { id })
  const wait = (id, check = terminal) =>
    condition(async () => {
      const task = await get(id)
      return check(task) && task
    }, `task ${id}`)
  const common = ['--vidbee-no-autostart']
  for (const [name, args] of [
    ['parse-compact', ['--vidbee-target', 'invalid']],
    ['parse-pretty', ['--vidbee-pretty', '--vidbee-timeout', 'invalid']],
    ['reserved-typo', ['--vidbee-wiat']],
    ['unknown-colon', [':unknown-golden']],
    ['unknown-verb', [':download', 'unknown-golden']],
    ['help-command', [':help']],
    ['cli-version', [':version']],
    ['ytdlp-version', ['--version']],
    ['probe-success', ['--dump-json', 'golden-probe']],
    ['probe-nonzero', ['--dump-json', 'golden-probe']],
    ['probe-oversize', ['--dump-json', 'golden-probe']]
  ]) {
    await run(name, [...common, ...args], {
      GOLDEN_PROBE_MODE:
        name === 'probe-nonzero' ? 'nonzero' : name === 'probe-oversize' ? 'oversize' : 'version'
    })
  }
  // Real yt-dlp, distinct from the deterministic process fixture above.
  const bundled = path.join(build, 'resources/resources/yt-dlp_linux')
  await run('probe-loopback', [...common, '--dump-json', `${server.url}/phase8/page.html`], {
    YTDLP_PATH: bundled
  })
  await call('update_settings', {
    maxConcurrentDownloads: 5,
    downloadPath: alias,
    browserForCookies: 'none',
    cookiesPath: '',
    proxy: '',
    configPath: '',
    downloadSubtitles: false,
    embedSubs: false,
    writeAutoSubs: false,
    embedThumbnail: false,
    embedMetadata: false,
    embedChapters: false,
    filenameViaVidBee: false,
    sequentialFilenames: false,
    downloadWithoutChannelSubfolders: true,
    autoTranscribeAfterDownload: false
  })
  const stream = await client.events()
  try {
    const argsFor = (label, route, waitFlag = false) => [
      ...common,
      ...(waitFlag ? ['--vidbee-wait'] : []),
      '--vidbee-max-attempts',
      '0',
      '-o',
      `${alias}/${label}.%(ext)s`,
      `${server.url}/${route}`
    ]
    const detached = await run('desktop-detached', argsFor('cli-detached', 'cli-detached.mp4'))
    assert.equal(detached.code, 0)
    await wait(detached.stdout.task.id)
    const success = await run('desktop-wait-success', argsFor('cli-wait', 'cli-wait.mp4', true))
    assert.equal(success.code, 0)
    await run('wait-non-success', argsFor('cli-failure', '404-cli.mp4', true))
    // HTTP 429 has a fixed 30s queue backoff; capture must end before a second attempt.
    const retryArgs = argsFor('cli-retry-scheduled', '429-cli.mp4', true)
    retryArgs[retryArgs.indexOf('--vidbee-max-attempts') + 1] = '3'
    const retry = await run('wait-retry-scheduled', retryArgs, {}, [], 20_000)
    await call('manage_task', { id: retry.stdout.task.id, action: 'cancel' })
    // --help is forwarded to yt-dlp and admitted; it is not CLI help.
    const help = await run('help-forwarded', [...common, '--help'])
    if (help.stdout?.task?.id) {
      await wait(help.stdout.task.id)
    }
    for (const action of ['cancel', 'pause']) {
      const route = `slow-cli-${action}.mp4`
      const admitted = await invoke(argsFor(`cli-${action}`, route))
      assert.equal(admitted.code, 0)
      const id = admitted.stdout.task.id
      await wait(
        id,
        (task) =>
          task.status === 'running' &&
          task.progress.bytesDownloaded > 0 &&
          server.requests.filter(
            (request) => request.method === 'GET' && request.path === `/${route}`
          ).length >= 2
      )
      await run(`control-${action}`, [...common, ':download', action, id])
      await wait(id, (task) => task.status === (action === 'pause' ? 'paused' : 'cancelled'))
      if (action === 'pause') {
        await record('cli-additions/wait-paused', { task: snapshot(await get(id)) })
        await run('control-resume', [...common, ':download', 'resume', id])
        await wait(id)
      }
      const finished = await get(id)
      await condition(
        () =>
          stream.values.filter((event) => event.type === 'transition' && event.taskId === id).at(-1)
            ?.to === finished.status,
        `SSE fence ${id}`
      )
      await record(`cli-additions/control-${action}-lifecycle`, {
        task: snapshot(finished),
        statuses: stream.values
          .filter((event) => event.type === 'transition' && event.taskId === id)
          .map((event) => event.to)
      })
    }
    const pausedRoute = 'slow-cli-wait-paused.mp4'
    const waiting = invoke(argsFor('cli-wait-paused', pausedRoute, true))
    // Attach a rejection handler immediately while observing the admitted task.
    const pending = waiting.then(
      (value) => ({ value }),
      (error) => ({ error })
    )
    const pausedTask = await condition(async () => {
      const listed = await call('list_tasks', { limit: 100 })
      return listed.tasks.find((task) => task.url === `${server.url}/${pausedRoute}`)
    }, 'CLI wait admission')
    await wait(
      pausedTask.id,
      (task) =>
        task.status === 'running' &&
        task.progress.bytesDownloaded > 0 &&
        server.requests.filter(
          (request) => request.method === 'GET' && request.path === `/${pausedRoute}`
        ).length >= 2
    )
    await call('manage_task', { id: pausedTask.id, action: 'pause' })
    const pausedResult = await pending
    if (pausedResult.error) {
      throw pausedResult.error
    }
    assert.equal(pausedResult.value.stdout.task.status, 'paused')
    await record('cli-additions/desktop-wait-paused', pausedResult.value)
    await call('manage_task', { id: pausedTask.id, action: 'cancel' })
    const failed = await invoke(argsFor('cli-recover', 'recover-cli.mp4', true))
    server.recover()
    await run('control-retry', [...common, ':download', 'retry', failed.stdout.task.id])
    await wait(failed.stdout.task.id)
    await run('history-remove', [...common, ':history', 'remove', failed.stdout.task.id])
    await run('history-removed-status', [...common, ':download', 'status', failed.stdout.task.id])
  } finally {
    await stream.close()
    await writeFile(path.join(directory, 'events.json'), JSON.stringify(stream.values, null, 2))
  }
  const missing = path.join(directory, 'absent-descriptor.json')
  await run('descriptor-absent', [...common, ':status'], { VIDBEE_AUTOMATION_DESCRIPTOR: missing })
  const stale = path.join(directory, 'stale-descriptor.json')
  const descriptor = JSON.parse(await readFile(env.VIDBEE_AUTOMATION_DESCRIPTOR, 'utf8'))
  await writeFile(stale, JSON.stringify({ ...descriptor, pid: 2_147_483_647 }))
  await run('descriptor-stale', [...common, ':status'], { VIDBEE_AUTOMATION_DESCRIPTOR: stale })
  // Fake launcher publishes only this suite's descriptor. PATH never reaches an installed launcher.
  const launcherLog = path.join(directory, 'launcher.json')
  const launcher = path.join(bin, 'vidbee-desktop')
  await writeFile(
    launcher,
    `#!${process.execPath}
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.GOLDEN_LAUNCHER_LOG, JSON.stringify(process.argv.slice(2)));
writeFileSync(process.env.VIDBEE_AUTOMATION_DESCRIPTOR, process.env.GOLDEN_DESCRIPTOR);
`
  )
  await chmod(launcher, 0o755)
  await run('descriptor-autostart', ['--vidbee-timeout', '30000', ':status'], {
    VIDBEE_AUTOMATION_DESCRIPTOR: missing,
    GOLDEN_LAUNCHER_LOG: launcherLog,
    GOLDEN_DESCRIPTOR: JSON.stringify(descriptor)
  })
  await record('cli-additions/launcher-arguments', JSON.parse(await readFile(launcherLog, 'utf8')))
  // Controlled fetch and clock affect only the child, never the app or fixture config.
  const preload = path.join(directory, 'upgrade-preload.mjs')
  await writeFile(
    preload,
    `Date.now = () => 1735689600000;
globalThis.fetch = async (url, options) => { if (String(url) !== 'https://registry.npmjs.org/@vidbee/cli/latest') throw new Error('unexpected fetch'); return new Response(process.env.GOLDEN_REGISTRY_ERROR ? '{}' : '{"version":"99.0.0"}', {status: process.env.GOLDEN_REGISTRY_ERROR ? 503 : 200}) };
`
  )
  const cache = path.join(directory, 'upgrade-cache.json')
  await writeFile(cache, JSON.stringify({ version: '98.0.0', fetchedAt: 1_735_689_600_000 }))
  await run('upgrade-cached', [':upgrade', '--cache', cache], {}, ['--import', preload])
  await run('upgrade-forced', [':upgrade', '--force', '--cache', cache], {}, ['--import', preload])
  await run(
    'upgrade-error',
    [':upgrade', '--force', '--cache', cache],
    { GOLDEN_REGISTRY_ERROR: '1' },
    ['--import', preload]
  )
  const sqliteOutput = await command(
    process.execPath,
    [
      '--import',
      'tsx',
      fileURLToPath(new URL('./cli-local-seam.mjs', import.meta.url)),
      path.join(directory, 'local.db'),
      alias,
      bundled,
      env.FFMPEG_PATH,
      `${server.url}/local-sqlite.mp4`
    ],
    { env, timeoutMs: 180_000 }
  )
  raw.push({ seam: 'local-sqlite-reopen', output: sqliteOutput })
  await record('cli-additions/local-sqlite-reopen', {
    code: sqliteOutput.code,
    signal: sqliteOutput.signal,
    stdout: parse(sqliteOutput.stdout),
    stderr: sqliteOutput.stderr
  })
  for (const waitFlag of [true, false]) {
    await run(
      waitFlag ? 'local-memory-wait' : 'local-detached-shutdown',
      [
        '--vidbee-local',
        ...(waitFlag ? ['--vidbee-wait'] : []),
        '--vidbee-max-attempts',
        '0',
        '-o',
        `${alias}/local-${waitFlag}.%(ext)s`,
        `${server.url}/local-${waitFlag}.mp4`
      ],
      { YTDLP_PATH: bundled }
    )
  }
}
