import { mkdir, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { startLoopback } from './loopback.mjs'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const payload = (response) => response.result?.structuredContent?.result ?? response
const terminal = (task) =>
  ['completed', 'failed', 'cancelled', 'retry-scheduled'].includes(task.status)
// The public task log contains timing-dependent progress text. Keep it in raw
// evidence; goldens retain every other field except the explicitly unpinned progress.
const snapshot = ({ progress, log, ...task }) => ({
  ...task,
  progressFields: Object.keys(progress)
})

const queueDelta = (before, after, group) => ({
  total: after.total - before.total,
  byStatus: Object.fromEntries(
    Object.keys(after.byStatus).map((key) => [key, after.byStatus[key] - before.byStatus[key]])
  ),
  running: after.running,
  queued: after.queued,
  capacity: after.capacity,
  groupCount: after.perGroup[group]
})

export async function runLoopbackCases({ client, runDir, build, record, roots, command }) {
  const server = await startLoopback(runDir)
  const alias = path.join(root, `.golden-loopback-${path.basename(path.dirname(runDir))}`)
  const downloads = path.join(runDir, 'downloads')
  let stream
  let aliasCreated = false
  const raw = []
  try {
    await mkdir(downloads, { recursive: true })
    await symlink(downloads, alias)
    aliasCreated = true
    roots.unshift([alias, '<run>/downloads'])
    stream = await client.events()
    const logPath = path.join(runDir, 'userdata/logs/main.log')
    const logStart = (await readFile(logPath, 'utf8')).length
    const ids = []
    const call = async (tool, args = {}) => {
      const response = await client.mcp(tool, args)
      raw.push({ tool, args, response })
      if (response.error || response.result?.isError) {
        throw new Error(`${tool}: ${JSON.stringify(response)}`)
      }
      return payload(response)
    }
    const wait = async (id, condition = terminal) => {
      const deadline = Date.now() + 25_000
      while (Date.now() < deadline) {
        const task = await call('get_task', { id })
        if (condition(task)) {
          return task
        }
        await delay(20)
      }
      throw new Error(`Loopback condition timed out for ${id}`)
    }
    const statuses = (id) =>
      stream.values
        .filter((event) => event.type === 'transition' && event.taskId === id)
        .map((event) => event.to)
        .filter((value, i, values) => i === 0 || value !== values[i - 1])
    const admit = async (label, route, options = {}, tool = 'download_media') => {
      const args = {
        url: `${server.url}/${route}`,
        type: 'video',
        customDownloadPath: alias,
        customFilenameTemplate: `${label}.%(ext)s`,
        ...options
      }
      const result = await call(
        tool,
        tool === 'create_task' ? { kind: args.type, url: args.url, title: label } : args
      )
      const id = result.task?.id ?? result.id
      if (!id) {
        throw new Error(`No admitted task: ${JSON.stringify(result)}`)
      }
      ids.push(id)
      return { id, args, admission: result }
    }
    const finish = async (label, admitted) => {
      const task = await wait(admitted.id)
      // An SSE fence: wait for the transition corresponding to the snapshot.
      const deadline = Date.now() + 2000
      while (statuses(task.id).at(-1) !== task.status && Date.now() < deadline) {
        await delay(5)
      }
      if (statuses(task.id).at(-1) !== task.status) {
        throw new Error(`Missing terminal transition for ${task.id}`)
      }
      const history = await call('list_download_history', { query: task.url })
      const ownHistory = history.items.filter((item) => item.id === task.id)
      let file = null
      if (task.output?.filePath) {
        const actual = await stat(task.output.filePath)
        const probe = await command(path.join(build, 'resources/resources/ffmpeg/ffprobe'), [
          '-v',
          'error',
          '-show_entries',
          'format=format_name,duration,size:stream=codec_name,codec_type,width,height,sample_rate,channels',
          '-of',
          'json',
          task.output.filePath
        ])
        if (probe.code !== 0) {
          throw new Error(`ffprobe failed: ${probe.stderr}`)
        }
        file = {
          size: actual.size,
          name: path.basename(task.output.filePath),
          probe: JSON.parse(probe.stdout)
        }
      }
      await record(`loopback/${label}`, {
        task: snapshot(task),
        statuses: statuses(task.id),
        history: ownHistory,
        file,
        ...(['video', 'remux', 'audio', 'image'].includes(label)
          ? { queue: queueDelta(before, await call('get_queue_stats'), new URL(server.url).host) }
          : {})
      })
      return task
    }
    for (const id of ['golden-queued', 'golden-running', 'golden-processing']) {
      await wait(id)
    }
    const before = await call('get_queue_stats')
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
    await finish('video', await admit('loopback-video', 'video.mp4'))
    await finish('remux', await admit('loopback-remux', 'remux', { containerFormat: 'mkv' }))
    await finish(
      'audio',
      await admit('loopback-audio', 'audio.wav', { type: 'audio', audioFormat: 'mp3' })
    )
    await finish('image', await admit('loopback-image', 'image.png'))
    for (const code of [404, 500]) {
      const admitted = await admit(`loopback-${code}`, `${code}.mp4`)
      await finish(`http-${code}`, admitted)
      if (code === 500) {
        await call('manage_task', { id: admitted.id, action: 'cancel' })
        await finish('http-500-cancelled', admitted)
      }
    }
    const retry = await admit('loopback-retry', 'recover.mp4')
    await finish('retry-failed', retry)
    server.recover()
    await call('manage_task', { id: retry.id, action: 'retry' })
    await finish('retry-completed', retry)
    for (const action of ['cancel', 'pause']) {
      const admitted = await admit(`loopback-${action}`, `slow-${action}.mp4`)
      await wait(
        admitted.id,
        (task) =>
          task.status === 'running' &&
          task.progress.bytesDownloaded > 0 &&
          server.requests.filter((request) => request.path === `/slow-${action}.mp4`).length >= 3
      )
      if (action === 'cancel') {
        const duplicate = await call('download_media', admitted.args)
        await record('loopback/duplicate', {
          created: duplicate.created,
          sameTask: duplicate.task?.id === admitted.id,
          status: duplicate.task?.status
        })
      }
      await call('manage_task', { id: admitted.id, action })
      if (action === 'pause') {
        const paused = await wait(admitted.id, (task) => task.status === 'paused')
        await record('loopback/paused', { task: snapshot(paused), statuses: statuses(admitted.id) })
        await call('manage_task', { id: admitted.id, action: 'resume' })
      }
      await finish(action === 'cancel' ? 'cancelled' : 'resumed', admitted)
      await record(
        `loopback/${action}-files`,
        (await readdir(downloads)).filter((name) => name.startsWith(`loopback-${action}`)).sort()
      )
    }
    await finish('create-task', await admit('loopback-create', 'create.mp4', {}, 'create_task'))
    const batch = await call('download_batch', {
      urls: [`${server.url}/batch.mp4`],
      options: {
        type: 'video',
        customDownloadPath: alias,
        customFilenameTemplate: 'loopback-batch.%(ext)s'
      }
    })
    await writeFile(path.join(runDir, 'loopback/batch.json'), JSON.stringify(batch, null, 2))
    const batchItem = batch.results?.[0] ?? batch.items?.[0]
    const batchId = batchItem?.task?.id ?? batchItem?.result?.task?.id
    if (!batchId) {
      throw new Error(`Unknown batch response: ${JSON.stringify(batch)}`)
    }
    ids.push(batchId)
    await finish('batch', { id: batchId })
    const automation = await client.http('POST', '/automation/v1/add', {
      input: {
        kind: 'video',
        url: `${server.url}/automation.mp4`,
        title: 'loopback-automation',
        options: {
          type: 'video',
          customDownloadPath: alias,
          customFilenameTemplate: 'loopback-automation.%(ext)s'
        }
      }
    })
    await writeFile(
      path.join(runDir, 'loopback/automation.json'),
      JSON.stringify(automation, null, 2)
    )
    if (!automation.body?.id) {
      throw new Error(`Unknown automation response: ${JSON.stringify(automation)}`)
    }
    ids.push(automation.body.id)
    await finish('automation', { id: automation.body.id })
    const after = await call('get_queue_stats')
    await record('loopback/queue-delta', queueDelta(before, after, new URL(server.url).host))
    const listed = await call('list_tasks', { limit: 100 })
    await record(
      'loopback/list-tasks',
      listed.tasks.filter((task) => ids.includes(task.id)).map(snapshot)
    )
    const newLog = (await readFile(logPath, 'utf8')).slice(logStart)
    const allowedErrors = [
      'Using fallback thinking options: TypeError: fetch failed',
      'Failed to cache thumbnail: TypeError: fetch failed',
      ...['404', '500', 'recover'].map(
        (name) =>
          `Failed to fetch metadata for: ${server.url}/${name}.mp4 Error: ERROR: [generic] ${name}:`
      )
    ]
    const unexpected = newLog
      .split('\n')
      .filter(
        (line) =>
          line.includes('[error]') && !allowedErrors.some((signature) => line.includes(signature))
      )
    if (unexpected.length) {
      throw new Error(`Unexpected loopback application errors: ${JSON.stringify(unexpected)}`)
    }
    await writeFile(path.join(runDir, 'loopback/state.json'), JSON.stringify({ ids, alias }))
  } finally {
    try {
      await writeFile(path.join(runDir, 'loopback/raw.json'), JSON.stringify(raw, null, 2))
      if (stream) {
        await writeFile(
          path.join(runDir, 'loopback/events.json'),
          JSON.stringify(stream.values, null, 2)
        )
      }
    } finally {
      try {
        if (stream) {
          await stream.close()
        }
      } finally {
        try {
          await server.close()
        } finally {
          if (aliasCreated) {
            await rm(alias, { force: true })
          }
        }
      }
    }
  }
}

export async function runLoopbackRestart({ client, originalRun, record, roots }) {
  const { ids, alias } = JSON.parse(
    await readFile(path.join(originalRun, 'loopback/state.json'), 'utf8')
  )
  roots.unshift([alias, '<run>/downloads'], [originalRun, '<run>'])
  const listed = payload(await client.mcp('list_tasks', { limit: 100 }))
  const history = payload(await client.mcp('list_download_history', { limit: 100 }))
  await record('loopback/restart', {
    tasks: listed.tasks.filter((task) => ids.includes(task.id)).map(snapshot),
    history: history.items.filter((item) => ids.includes(item.id))
  })
}
