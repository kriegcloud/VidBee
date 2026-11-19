import { createHash } from 'node:crypto'
import { access, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { browserCaptureCdp } from './browser-capture-cdp.mjs'
import { profileFixtures } from './browser-capture-fixture.mjs'
import { startBrowserCaptureLoopback } from './browser-capture-loopback.mjs'

const payload = (response) => response.result?.structuredContent?.result ?? response
const snapshot = ({ progress, log, ...task }) => ({
  ...task,
  progressFields: Object.keys(progress)
})

async function prerequisitesAvailable() {
  try {
    for (const binary of [
      '/usr/bin/Xvfb',
      '/usr/bin/chromium',
      '/usr/bin/pactl',
      '/usr/bin/xdpyinfo'
    ]) {
      await access(binary, 1)
    }
    return true
  } catch {
    process.stdout.write(
      'SKIP browser capture goldens: requires executable host Xvfb, Chromium, pactl and xdpyinfo\n'
    )
    return false
  }
}

export async function runBrowserCaptureRestart({ record }) {
  if (!(await prerequisitesAvailable())) {
    return false
  }
  const cdp = await browserCaptureCdp()
  try {
    for (const [site, method] of [
      ['onlyfans', 'listOnlyFansProfiles'],
      ['fansly', 'listFanslyProfiles']
    ]) {
      await record(`browser-capture/restart-${site}`, await cdp.ipc(method))
    }
  } finally {
    cdp.close()
  }
}

export async function runBrowserCaptureCases({ client, runDir, build, record, roots, command }) {
  if (!(await prerequisitesAvailable())) {
    return false
  }
  const alias = path.join(
    process.cwd(),
    `.golden-browser-capture-${path.basename(path.dirname(runDir))}`
  )
  await symlink(path.join(runDir, 'downloads'), alias)
  roots.unshift([alias, '<run>/downloads'])
  let server
  let cdp
  let stream
  const raw = []
  const directory = path.join(runDir, 'browser-capture')
  const call = async (name, args) => {
    const response = await client.mcp(name, args)
    raw.push({ name, args, response })
    return payload(response)
  }
  const ipc = async (method, input) => {
    const response = await cdp.ipc(method, input)
    raw.push({ method, input, response })
    return response
  }
  const wait = async (condition, label) => {
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const value = await condition()
      if (value) {
        return value
      }
      await delay(50)
    }
    throw new Error(`Browser capture condition deadline: ${label}`)
  }
  await mkdir(directory, { recursive: true })
  try {
    server = await startBrowserCaptureLoopback(runDir)
    cdp = await browserCaptureCdp()
    stream = await client.events()
    for (const [site, list, method, download] of [
      ['onlyfans', 'listOnlyFansProfiles', 'onlyFansProfileCommand', 'downloadOnlyFansProfile'],
      ['fansly', 'listFanslyProfiles', 'fanslyProfileCommand', 'downloadFanslyProfile']
    ]) {
      await record(`browser-capture/list-${site}`, await ipc(list))
      for (const [fixtureSite, key, identity] of profileFixtures.filter(
        ([fixtureSite]) => fixtureSite === site
      )) {
        await record(
          `browser-capture/get-${fixtureSite}-${key}`,
          await ipc(method, { action: 'get', url: identity.profileUrl })
        )
      }
      await record(
        `browser-capture/invalid-${site}`,
        await ipc(method, { action: 'get', url: 'https://example.invalid/synthetic' })
      )
      await record(
        `browser-capture/selection-${site}`,
        await ipc(download, {
          url: `https://${site}.com/synthetic_creator`,
          itemIds: ['1002', '1003']
        })
      )
    }
    const prerequisites = await Promise.all(
      ['/usr/bin/Xvfb', '/usr/bin/chromium', '/usr/bin/pactl', '/usr/bin/xdpyinfo'].map(
        async (binary) => ({ binary, ...(await command('/usr/bin/test', ['-x', binary])) })
      )
    )
    const browserReady = prerequisites.every((value) => value.code === 0)
    if (browserReady) {
      const url = 'https://onlyfans.com/synthetic_creator'
      await ipc('onlyFansProfileCommand', { action: 'map', url })
      const mapped = await wait(async () => {
        const result = await ipc('onlyFansProfileCommand', { action: 'get', url })
        return result.ok && result.value.state !== 'mapping' && result
      }, 'unauthenticated OnlyFans mapping')
      await record('browser-capture/mapping-onlyfans', mapped)
    } else {
      process.stdout.write(
        'SKIP browser capture playback/mapping: requires host Xvfb, Chromium, pactl and xdpyinfo\n'
      )
    }
    for (const [name, url] of [
      ['drm-candidate', `${server.url}/drm.html`],
      ['drm-pause', `${server.url}/drm-pause.html`],
      ['drm-cancel', `${server.url}/drm-cancel.html`],
      ['no-video', `${server.url}/no-video.html`],
      ['onlyfans-legacy', 'https://onlyfans.com/synthetic_creator/media/1001'],
      ['fansly-legacy', 'https://fansly.com/synthetic_creator']
    ]) {
      if (name.startsWith('drm') && !browserReady) {
        continue
      }
      const cursor = server.requests.length
      const admitted = await client.http('POST', '/automation/v1/add', {
        input: {
          kind: 'video',
          url,
          title: `browser-capture-${name}`,
          options: {
            type: 'video',
            customDownloadPath: alias,
            customFilenameTemplate: `browser-capture-${name}.%(ext)s`
          }
        }
      })
      raw.push({ name, admitted })
      if (!admitted.body?.id) {
        throw new Error(`Admission failed: ${JSON.stringify(admitted)}`)
      }
      const id = admitted.body.id
      let observedBeforeControl
      if (['drm-pause', 'drm-cancel'].includes(name)) {
        await wait(async () => {
          const task = await call('get_task', { id })
          observedBeforeControl = task
          return (
            task.status === 'running' &&
            task.progress.percent > 0 &&
            server.requests
              .slice(cursor)
              .some((entry) => entry.method === 'GET' && entry.path === '/silent.mp4')
          )
        }, `${name} positive capture progress and browser request`)
        await call('manage_task', { id, action: name === 'drm-pause' ? 'pause' : 'cancel' })
      }
      const task = await wait(async () => {
        const task = await call('get_task', { id })
        return (
          ['failed', 'completed', 'cancelled', 'retry-scheduled', 'paused'].includes(task.status) &&
          task
        )
      }, name)
      await wait(
        () =>
          stream.values.some(
            (event) =>
              event.type === 'transition' && event.taskId === id && event.to === task.status
          ),
        `${name} SSE`
      )
      await record(`browser-capture/${name}`, {
        task: snapshot(task),
        statuses: stream.values
          .filter((event) => event.type === 'transition' && event.taskId === id)
          .map((event) => event.to),
        history: (await call('list_download_history', { query: url })).items.filter(
          (item) => item.id === id
        ),
        ...(name.startsWith('drm')
          ? {
              reachability: observedBeforeControl
                ? {
                    positiveProgress: observedBeforeControl.progress.percent > 0,
                    mediaBodyObserved: server.requests
                      .slice(cursor)
                      .some((entry) => entry.method === 'GET' && entry.path === '/silent.mp4')
                  }
                : {
                    browserPlayback: task.log?.includes('Waiting for in-browser playback') ?? false,
                    recorderStarted: task.log?.includes('ffmpeg x11grab started') ?? false,
                    positiveProgress: task.progress.percent > 0
                  }
            }
          : {})
      })
      if (['retry-scheduled', 'paused'].includes(task.status)) {
        await call('manage_task', { id, action: 'cancel' })
      }
    }
    await writeFile(
      path.join(directory, 'configuration.json'),
      JSON.stringify(
        {
          build,
          node: process.version,
          display: { profile: '1280x800x24', capture: '3840x3840x24' },
          audio: await command('/usr/bin/pactl', ['info'], {
            env: {
              PATH: '/usr/bin:/bin',
              HOME: path.join(runDir, 'home'),
              XDG_RUNTIME_DIR: path.join(runDir, 'home/.cache')
            }
          }),
          jobs: await Promise.all(
            (await readdir(path.join(runDir, 'tmp')))
              .filter((name) => name.startsWith('vidbee-capture-'))
              .map(async (name) => {
                const job = JSON.parse(
                  await readFile(path.join(runDir, 'tmp', name, 'job.json'), 'utf8')
                )
                return {
                  directory: name,
                  job,
                  browserVersion: await command(job.browserExecutable, ['--version'], {
                    env: { PATH: '/usr/bin:/bin', HOME: path.join(runDir, 'home') }
                  })
                }
              })
          ),
          fixtures: await Promise.all(
            ['landscape', 'portrait', 'silent'].map(async (name) => {
              const filename = path.join(runDir, 'userdata/browser-capture-fixtures', `${name}.mp4`)
              const bytes = await readFile(filename)
              return {
                name,
                size: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                probe: await command(path.join(build, 'resources/resources/ffmpeg/ffprobe'), [
                  '-v',
                  'error',
                  '-show_format',
                  '-show_streams',
                  '-of',
                  'json',
                  filename
                ])
              }
            })
          ),
          ffmpeg: await command(path.join(build, 'resources/resources/ffmpeg/ffmpeg'), [
            '-version'
          ]),
          binaries: await Promise.all(
            [
              ['/usr/bin/chromium', ['--version']],
              ['/usr/bin/pactl', ['--version']],
              ['/usr/bin/Xvfb', ['-help']]
            ].map(async ([binary, args]) => ({ binary, ...(await command(binary, args)) }))
          )
        },
        null,
        2
      )
    )
    await mkdir(path.join(directory, 'profiles'), { recursive: true })
  } finally {
    await writeFile(path.join(directory, 'raw.json'), JSON.stringify(raw, null, 2))
    await writeFile(
      path.join(directory, 'events.json'),
      JSON.stringify(stream?.values ?? [], null, 2)
    )
    cdp?.close()
    try {
      await stream?.close()
    } finally {
      try {
        await server?.close()
      } finally {
        await rm(alias, { force: true })
      }
    }
  }
}

export async function prepareBrowserCaptureOnly({ client, runDir, root }) {
  await mkdir(path.join(runDir, 'downloads'), { recursive: true })
  await mkdir(path.join(runDir, 'loopback'), { recursive: true })
  const alias = path.join(root, `.golden-loopback-${path.basename(path.dirname(runDir))}`)
  await writeFile(path.join(runDir, 'loopback/state.json'), JSON.stringify({ ids: [], alias }))
  const response = await client.mcp('update_settings', {
    maxConcurrentDownloads: 5,
    downloadPath: path.join(runDir, 'downloads'),
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
  if (response.error || response.result?.isError) {
    throw new Error('Browser capture settings rejected')
  }
}
