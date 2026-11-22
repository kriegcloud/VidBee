import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { assertTranscriptionCpuProviders } from './transcription-cpu.mjs'
import { startTranscriptionLoopback } from './transcription-loopback.mjs'

const terminal = (task) =>
  ['completed', 'failed', 'cancelled', 'retry-scheduled'].includes(task.status)
export async function runTranscriptionCases({
  client,
  runDir,
  record: writeRecord,
  contractOnly = false
}) {
  const explore = process.env.VIDBEE_TRANSCRIPTION_EXPLORE === '1'
  const record = writeRecord
  const raw = []
  const timings = []
  let checkpoint = Date.now()
  const events = await client.events()
  let server
  try {
    server = await startTranscriptionLoopback(runDir)
  } catch (error) {
    await events.close()
    throw error
  }
  const call = async (tool, args = {}) => {
    const response = await client.mcp(tool, args)
    raw.push({ tool, args, response })
    assertTranscriptionCpuProviders(response)
    if (raw.length % 25 === 0) {
      await writeFile(
        path.join(runDir, 'transcription-exploration.json'),
        JSON.stringify(raw, null, 2)
      )
    }
    if (response.error || response.result?.isError) {
      throw new Error(`${tool}: ${JSON.stringify(response)}`)
    }
    return response.result.structuredContent.result
  }
  const wait = async (read, predicate, label) => {
    const started = Date.now()
    const deadline = started + 300_000
    while (Date.now() < deadline) {
      const value = await read()
      if (predicate(value)) {
        timings.push({ label, elapsedMs: Date.now() - started, boundMs: 300_000 })
        return value
      }
      await delay(40)
    }
    throw new Error(`Transcription condition timed out: ${label}`)
  }
  const get = (id) => call('get_transcript', { downloadId: id, includeWords: true })
  const tasks = (id) => call('list_tasks', { parentId: id })
  const finish = async (id) => {
    const state = await get(id)
    const task = await wait(() => call('get_task', { id: state.transcriptionTaskId }), terminal, id)
    return { task, transcript: await get(id) }
  }
  const ownedWorkers = async () => {
    const result = []
    for (const pid of await readdir('/proc')) {
      if (!/^\d+$/.test(pid)) {
        continue
      }
      try {
        const cmd = await readFile(`/proc/${pid}/cmdline`, 'utf8')
        if (!/transcription.*worker|worker.*transcription|ai-worker/.test(cmd)) {
          continue
        }
        const env = await readFile(`/proc/${pid}/environ`, 'utf8')
        if (env.split('\0').includes(`HOME=${runDir}/home`)) {
          result.push({ pid: Number(pid), cmd: cmd.replaceAll('\0', ' ') })
        }
      } catch (error) {
        // EACCES: a process in another user namespace (for example another run on the same
        // host); its environment cannot be ours, so it is not one of this run's workers.
        if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) {
          throw error
        }
      }
    }
    return result
  }
  const taskSnapshot = ({ progress, log, ...task }) => task
  const save = async (label, id) => {
    const value = await finish(id)
    const expectedStatus =
      label === 'missing-source' ? 'failed' : label === 'cancel-active' ? 'cancelled' : 'completed'
    if (value.task.status !== expectedStatus) {
      throw new Error(`${label}: expected ${expectedStatus}, received ${value.task.status}`)
    }
    const log = value.task.log ?? ''
    const statuses = events.values
      .filter((e) => e.taskId === value.task.id && e.type === 'transition')
      .map((e) => e.to)
      .filter((s, i, a) => i === 0 || s !== a[i - 1])
    await record(`transcription/${label}`, {
      ...value,
      task: taskSnapshot(value.task),
      statuses,
      ...(value.task.status === 'completed'
        ? { provider: /^compute\.provider=(\w+)/m.exec(log)?.[1] }
        : {})
    })
    timings.push({ label, elapsedMs: Date.now() - checkpoint })
    checkpoint = Date.now()
    return value
  }
  try {
    await call('update_settings', {
      language: 'en',
      asrTier: 'minimal',
      autoTranscribeAfterDownload: false,
      downloadPath: path.join(runDir, 'transcription-library')
    })
    await record('transcription/model-ready', await call('manage_asr_model', { action: 'status' }))
    const ensure = await call('manage_asr_model', { action: 'download', tier: 'minimal' })
    const ensured = await wait(
      () => call('get_task', { id: ensure.task.id }),
      terminal,
      'installed ensure'
    )
    if (ensured.status !== 'completed') {
      throw new Error(`Installed ensure failed: ${JSON.stringify(ensured)}`)
    }
    await record('transcription/model-installed-ensure', {
      created: ensure.created,
      task: taskSnapshot(ensured)
    })
    if (contractOnly) {
      process.stdout.write(
        'SKIP real ASR acceptance: --transcription-contract-only compares model contracts only; real-ASR scenarios are excluded\n'
      )
      return
    }
    const imported = await call('import_media', {
      paths: [path.join(runDir, 'userdata/transcription-fixtures/speech.wav')]
    })
    const speech = imported.imported[0].downloadId
    await save('local-complete', speech)
    await record(
      'transcription/local-export',
      await call('export_transcript', { downloadId: speech, format: 'srt', saveToFile: true })
    )
    for (const count of [1, 2]) {
      await call('manage_transcription', {
        downloadId: speech,
        action: 'rediarize',
        speakerCount: count
      })
      await save(`rediarize-${count}`, speech)
    }
    await call('start_transcription', { downloadId: speech, force: true, speakerCount: 1 })
    await save('force', speech)
    if (explore) {
      const pairImport = await call('import_media', {
        paths: [path.join(runDir, 'userdata/transcription-fixtures/two-clips.wav')]
      })
      const pairId = pairImport.imported[0].downloadId
      await save('two-clips', pairId)
      await call('manage_transcription', {
        downloadId: pairId,
        action: 'rediarize',
        speakerCount: 2
      })
      await save('two-clips-rediarize-2', pairId)
    }
    await call('update_settings', { maxConcurrentTranscriptions: 1 })
    const longImport = await call('import_media', {
      paths: [path.join(runDir, 'userdata/transcription-fixtures/long.wav')]
    })
    const longId = longImport.imported[0].downloadId
    await wait(
      () => get(longId),
      (value) =>
        value.stage === 'recognizing' ||
        value.stageHistory?.some((stage) => JSON.stringify(stage).includes('recognizing')),
      'active recognizing'
    )
    await call('start_transcription', { downloadId: speech, force: true, speakerCount: 1 })
    const source = path.join(runDir, 'userdata/transcription-fixtures/speech.wav')
    await rename(source, `${source}.held`)
    try {
      await writeFile(
        path.join(runDir, 'transcription-workers-active.json'),
        JSON.stringify(await ownedWorkers(), null, 2)
      )
      await call('manage_transcription', { downloadId: longId, action: 'cancel' })
      await save('cancel-active', longId)
      await save('missing-source', speech)
    } finally {
      await rename(`${source}.held`, source)
    }
    await call('manage_transcription', { downloadId: speech, action: 'retry' })
    await save('retry', speech)
    const released = await wait(
      ownedWorkers,
      (workers) => workers.length === 0,
      'owned worker release'
    )
    await writeFile(
      path.join(runDir, 'transcription-workers-released.json'),
      JSON.stringify(released)
    )
    await call('update_settings', { autoTranscribeAfterDownload: true })
    const downloaded = []
    for (const name of ['silence.wav', 'captions.mkv']) {
      const admission = await call('download_media', {
        url: `${server.url}/${name}`,
        type: 'video',
        customDownloadPath: path.join(runDir, 'transcription-downloads'),
        customFilenameTemplate: name
      })
      const id = admission.task?.id ?? admission.id
      await wait(() => call('get_task', { id }), terminal, name)
      await wait(
        () => tasks(id),
        (list) => list.tasks.length > 0,
        `automatic child ${name}`
      )
      await save(name === 'silence.wav' ? 'auto-no-speech' : 'auto-caption', id)
      downloaded.push(id)
      if (name === 'captions.mkv') {
        const transcript = await get(id)
        for (const source of transcript.sources) {
          await call('manage_transcription', {
            downloadId: id,
            action: 'select_source',
            key: source.key
          })
          await wait(
            () => get(id),
            (value) => value.listState === 'completed',
            `source ${source.key}`
          )
          await record(
            `transcription/caption-source-${source.key.replaceAll(':', '-')}`,
            await get(id)
          )
          if (source.key === 'captions:en') {
            for (const count of [1, 2]) {
              await call('manage_transcription', {
                downloadId: id,
                action: 'rediarize',
                speakerCount: count
              })
              await save(`caption-rediarize-${count}`, id)
            }
          }
        }
      }
    }
    await writeFile(
      path.join(runDir, 'transcription-state.json'),
      JSON.stringify({ speech, downloaded })
    )
    const info = await stat(path.join(runDir, 'userdata/vidbee.db'))
    await record('transcription/physical-persistence', { databasePresent: info.size > 0 })
  } finally {
    try {
      await writeFile(
        path.join(runDir, 'transcription-exploration.json'),
        JSON.stringify(raw, null, 2)
      )
      await writeFile(
        path.join(runDir, 'transcription-timings.json'),
        JSON.stringify(timings, null, 2)
      )
      await writeFile(
        path.join(runDir, 'transcription-events.json'),
        JSON.stringify(events.values, null, 2)
      )
    } finally {
      try {
        await events.close()
      } finally {
        await server.close()
      }
    }
  }
}

export async function runTranscriptionRestart({ client, runDir, originalRun, record, roots }) {
  let state
  try {
    state = JSON.parse(await readFile(path.join(originalRun, 'transcription-state.json'), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return
    }
    throw error
  }
  roots.unshift([originalRun, '<run>'])
  const raw = []
  for (const [label, id] of [
    ['speech', state.speech],
    ...state.downloaded.map((id, i) => [`download-${i}`, id])
  ]) {
    const response = await client.mcp('get_transcript', { downloadId: id, includeWords: true })
    if (response.error || response.result?.isError) {
      throw new Error(`Restart transcript read: ${JSON.stringify(response)}`)
    }
    raw.push({ label, id, response })
    await record(`transcription/restart-${label}`, response.result.structuredContent.result)
  }
  await writeFile(
    path.join(runDir, 'transcription-restart-readback.json'),
    JSON.stringify(raw, null, 2)
  )
}
