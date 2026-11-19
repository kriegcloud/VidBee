import { mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { startLoopback } from './loopback.mjs'
import { subscriptionRenderer } from './subscriptions-core-renderer.mjs'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const payload = (response) => response.result?.structuredContent?.result ?? response
const snapshot = ({ progress, log, ...task }) => ({
  ...task,
  progressFields: Object.keys(progress)
})
// Subscription check clocks are runtime observations; feed publication dates stay literal.
export const normalizeSubscriptionClocks = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeSubscriptionClocks)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /^(lastCheckedAt|lastSuccessAt)$/.test(key) && typeof entry === 'number'
          ? '<timestamp>'
          : normalizeSubscriptionClocks(entry)
      ])
    )
  }
  return value
}
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}
const poll = async (label, read, predicate, timeout = 60_000) => {
  const end = performance.now() + timeout
  while (performance.now() < end) {
    const value = await read()
    if (predicate(value)) {
      return value
    }
    await delay(50)
  }
  throw new Error(`Subscription condition timed out: ${label}`)
}

export async function runSubscriptionsCases({ client, runDir, record, roots }) {
  const server = await startLoopback(runDir, { subscriptions: true })
  const directory = path.join(runDir, 'subscription-downloads')
  const alias = path.join(root, `.golden-subs-${path.basename(path.dirname(runDir))}`)
  const logPath = path.join(runDir, 'userdata/logs/main.log')
  const logStart = (await readFile(logPath, 'utf8')).length
  const raw = []
  let stream
  const state = { ids: [], taskIds: [], alias }
  const call = async (tool, args = {}, allowError = false) => {
    const response = await client.mcp(tool, args)
    raw.push({ tool, args, response })
    if (!allowError) {
      assert(!(response.error || response.result?.isError), `${tool}: ${JSON.stringify(response)}`)
    }
    return payload(response)
  }
  const http = async (operation, input) => {
    const response = await client.http('POST', `/automation/v1/subscriptions/${operation}`, input)
    raw.push({ operation, input, response })
    assert(response.status === 200, `HTTP ${operation}: ${JSON.stringify(response)}`)
    return response
  }
  const pin = (name, value) =>
    record(`loopback-subscriptions/${name}`, normalizeSubscriptionClocks(value))
  const get = async (id) => (await http('get', { id })).body
  const items = (id) => call('list_subscription_items', { subscriptionId: id })
  const history = async (id) =>
    (await call('list_download_history', { query: id, limit: 100 })).items
  const completed = async (id) => {
    const task = await poll(
      `task ${id}`,
      () => call('get_task', { id }),
      (task) => ['completed', 'failed', 'cancelled'].includes(task.status)
    )
    assert(task.status === 'completed', `Task failed: ${JSON.stringify(task)}`)
    await poll(
      'completion event',
      async () => stream.values,
      (events) =>
        events.some(
          (event) => event.taskId === id && event.type === 'transition' && event.to === 'completed'
        )
    )
    const ownHistory = await poll(
      'persisted task history',
      () => history(id),
      (values) => values.some((entry) => entry.id === id)
    )
    const file = await stat(task.output.filePath)
    const automation = await client.http('POST', '/automation/v1/get', { id })
    raw.push({ operation: 'task/get', id, response: automation })
    return {
      task: snapshot(task),
      automation: snapshot(automation.body.task),
      history: ownHistory,
      file: { name: path.basename(task.output.filePath), size: file.size },
      statuses: stream.values
        .filter((event) => event.taskId === id && event.type === 'transition')
        .map((event) => event.to)
        .filter((status, index, values) => index === 0 || status !== values[index - 1])
    }
  }
  const triggers = new Map()
  const refresh = async (id, route, transport = 'mcp') => {
    const prior = await get(id)
    const cursor = server.subscriptions.requests.length
    const response =
      transport === 'mcp'
        ? await call('refresh_subscription', { id })
        : await http('refresh', { id })
    triggers.set(id, performance.now())
    const request = await poll(
      'completed XML response',
      async () => server.subscriptions.requests.slice(cursor),
      (values) =>
        values.some(
          (entry) =>
            entry.path === `/subscriptions-core/${route}` && entry.completed && entry.status === 200
        )
    )
    const subscription = await get(id)
    assert(
      subscription.status === 'up-to-date' && subscription.lastSuccessAt,
      'Refresh did not persist successful processing'
    )
    assert(
      !prior.lastSuccessAt || subscription.lastSuccessAt > prior.lastSuccessAt,
      'Refresh did not advance persisted last success'
    )
    return { response, subscription, requests: request.map(({ sequence, ...entry }) => entry) }
  }
  try {
    await mkdir(directory, { recursive: true })
    await symlink(directory, alias)
    roots.unshift([alias, '<run>/subscription-downloads'])
    stream = await client.events()
    await call('update_settings', {
      maxConcurrentDownloads: 5,
      downloadPath: alias,
      browserForCookies: 'none',
      cookiesPath: '',
      proxy: '',
      configPath: '',
      downloadSubtitles: false,
      subtitleLanguages: ['interface'],
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
    for (const [name, route] of [
      ['probe-rss', 'rss.xml'],
      ['probe-atom', 'atom.xml'],
      ['probe-discovery', 'redirect'],
      ['probe-invalid-xml', 'invalid.xml'],
      ['probe-failed-candidates', 'failed-discovery.html']
    ]) {
      const cursor = server.subscriptions.requests.length
      const response = await call('test_subscription', {
        url: `${server.url}/subscriptions-core/${route}`
      })
      await pin(name, {
        response,
        requests: server.subscriptions.requests.slice(cursor).map(({ sequence, ...entry }) => entry)
      })
    }
    const create = async (route, autoDownload) => {
      const result = await call('create_subscription', {
        url: `${server.url}/subscriptions-core/${route}`,
        enabled: false,
        autoDownload,
        onlyDownloadLatest: false,
        downloadDirectory: alias,
        namingTemplate: '%(id)s.%(ext)s',
        downloadType: 'video',
        downloadQuality: 'best',
        keywords: [],
        tags: ['loopback', 'science']
      })
      state.ids.push(result.subscription.id)
      assert(result.subscription.items.length === 0, 'Disabled creation unexpectedly stored items')
      return result
    }
    const manual = await create('redirect', false)
    const manualId = manual.subscription.id
    const automatic = await create('auto.xml', true)
    const automaticId = automatic.subscription.id
    await pin('create-read', {
      manual,
      automatic,
      get: await call('get_subscription', { id: manualId }),
      list: await call('list_subscriptions', { query: 'Loopback' }),
      items: await items(manualId)
    })
    await pin('duplicate', {
      exact: await call(
        'create_subscription',
        { url: `${server.url}/subscriptions-core/rss.xml`, enabled: false },
        true
      ),
      equivalent: await call(
        'create_subscription',
        { url: `${server.url}/subscriptions-core/rss.xml#same-feed`, enabled: false },
        true
      )
    })
    const initial = await refresh(manualId, 'rss.xml')
    await pin('refresh-items', {
      ...initial,
      page: await call('list_subscription_items', {
        subscriptionId: manualId,
        limit: 1,
        offset: 1
      }),
      pastEnd: await call('list_subscription_items', { subscriptionId: manualId, offset: 20 })
    })
    const autoRefresh = await refresh(automaticId, 'auto.xml', 'http')
    const autoTasks = []
    for (const item of autoRefresh.subscription.items) {
      assert(item.taskId && item.addedToQueue, 'Automatic item missing queue link')
      state.taskIds.push(item.taskId)
      autoTasks.push(await completed(item.taskId))
    }
    await pin('auto-download', {
      ...autoRefresh,
      tasks: autoTasks,
      items: await items(automaticId)
    })
    const queued = await call('queue_subscription_item', {
      subscriptionId: manualId,
      itemId: 'manual-retained'
    })
    state.taskIds.push(queued.taskId)
    const first = await completed(queued.taskId)
    await pin('manual-queue', {
      queued,
      task: first,
      repeat: await call('queue_subscription_item', {
        subscriptionId: manualId,
        itemId: 'manual-retained'
      }),
      items: await items(manualId)
    })
    const removed = await call('manage_task', { id: queued.taskId, action: 'remove' })
    const cleared = await poll(
      'removed task link cleared',
      () => items(manualId),
      (result) => result.items.find((item) => item.id === 'manual-retained')?.addedToQueue === false
    )
    const requeued = await call('queue_subscription_item', {
      subscriptionId: manualId,
      itemId: 'manual-retained'
    })
    assert(
      requeued.taskId && requeued.taskId !== queued.taskId,
      'Requeue did not create a new task'
    )
    state.taskIds.push(requeued.taskId)
    await pin('remove-task-requeue', {
      removed,
      cleared,
      requeued,
      task: await completed(requeued.taskId),
      items: await items(manualId)
    })
    await pin('renderer', await subscriptionRenderer(runDir))
    await call('update_subscription', { id: manualId, autoDownload: true })
    // Both initial triggers have happened; their real-time dedupe waits overlap.
    const deadline = Math.max(...triggers.values()) + 30_500
    await delay(Math.max(0, deadline - performance.now()))
    server.subscriptions.revision('B')
    const revision = await refresh(manualId, 'rss.xml', 'http')
    const revised = revision.subscription.items
    assert(
      revised.some((item) => item.id === 'manual-newer') &&
        !revised.some((item) => item.id === 'manual-dropped') &&
        revised.find((item) => item.id === 'manual-retained')?.taskId === requeued.taskId,
      'Revision replacement/link preservation failed'
    )
    const newer = revised.find((item) => item.id === 'manual-newer')
    assert(newer.taskId, 'Revision did not automatically admit its new item')
    state.taskIds.push(newer.taskId)
    await pin('refresh-revision', { ...revision, newerTask: await completed(newer.taskId) })
    const before = await items(automaticId)
    const beforeHistory = await call('list_download_history', {
      query: '/subscriptions-core/automatic-',
      limit: 100
    })
    const noDuplicate = await refresh(automaticId, 'auto.xml')
    const afterHistory = await call('list_download_history', {
      query: '/subscriptions-core/automatic-',
      limit: 100
    })
    assert(
      JSON.stringify(before.items) === JSON.stringify(noDuplicate.subscription.items),
      'Unchanged automatic refresh altered links/items'
    )
    assert(beforeHistory.total === afterHistory.total, 'Duplicate history admission')
    const automaticTasks = (await call('list_tasks', { limit: 100 })).tasks.filter(
      (task) => task.groupKey === automaticId
    )
    assert(automaticTasks.length === 2, `Automatic task count changed: ${automaticTasks.length}`)
    await pin('refresh-no-duplicate', {
      ...noDuplicate,
      history: afterHistory,
      tasks: automaticTasks.map(snapshot)
    })
    const manualTasks = (await call('list_tasks', { limit: 100 })).tasks.filter(
      (task) => task.groupKey === manualId
    )
    assert(manualTasks.length === 2, 'Previously seen manual item was admitted again')
    await pin('seen-after-removal', {
      retainedLink: revised.find((item) => item.id === 'manual-retained'),
      newTask: requeued.taskId,
      oldTask: queued.taskId,
      tasks: manualTasks.map(snapshot)
    })
    await pin('remove-read', {
      removed: await call('remove_subscription', { id: manualId }),
      get: await call('get_subscription', { id: manualId }, true),
      items: await call('list_subscription_items', { subscriptionId: manualId }, true),
      list: await call('list_subscriptions', { query: 'Loopback' })
    })
    const pending = await create('pending.xml', true)
    const pendingRefresh = await refresh(pending.subscription.id, 'pending.xml')
    const pendingIds = pendingRefresh.subscription.items.map((item) => item.taskId)
    await poll(
      'pending subscription task running',
      () => call('get_task', { id: pendingIds[0] }),
      (task) => task.status === 'running' && task.progress.bytesDownloaded > 0
    )
    const removePending = await call('remove_subscription', { id: pending.subscription.id })
    const cancelled = []
    for (const id of pendingIds) {
      cancelled.push(
        snapshot(
          await poll(
            'subscription removal cancels task',
            () => call('get_task', { id }),
            (task) => task.status === 'cancelled'
          )
        )
      )
    }
    await pin('remove-pending', {
      removed: removePending,
      tasks: cancelled,
      items: await call(
        'list_subscription_items',
        { subscriptionId: pending.subscription.id },
        true
      )
    })
    state.ids = [automaticId]
    const unexpectedErrors = (await readFile(logPath, 'utf8'))
      .slice(logStart)
      .split('\n')
      .filter(
        (line) =>
          line.includes('[error]') &&
          ![
            'Using fallback thinking options: TypeError: fetch failed',
            'Failed to cache thumbnail: TypeError: fetch failed'
          ].some((signature) => line.includes(signature))
      )
    await writeFile(
      path.join(runDir, 'subscriptions-core/application-errors.json'),
      JSON.stringify(unexpectedErrors, null, 2)
    )
    assert(
      unexpectedErrors.length === 0,
      `Unexpected subscription application errors: ${JSON.stringify(unexpectedErrors)}`
    )
    await writeFile(
      path.join(runDir, 'subscriptions-core/state.json'),
      JSON.stringify(state, null, 2)
    )
  } finally {
    try {
      await writeFile(
        path.join(runDir, 'subscriptions-core/raw.json'),
        JSON.stringify(raw, null, 2)
      )
      if (stream) {
        await writeFile(
          path.join(runDir, 'subscriptions-core/events.json'),
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
          await rm(alias, { force: true })
        }
      }
    }
  }
}

export async function runSubscriptionsRestart({ client, runDir, originalRun, record, roots }) {
  const state = JSON.parse(
    await readFile(path.join(originalRun, 'subscriptions-core/state.json'), 'utf8')
  )
  roots.unshift([state.alias, '<run>/subscription-downloads'], [originalRun, '<run>'])
  const subscriptions = []
  for (const id of state.ids) {
    subscriptions.push(await client.http('POST', '/automation/v1/subscriptions/get', { id }))
  }
  await writeFile(
    path.join(runDir, 'subscriptions-core-reopen.json'),
    JSON.stringify(subscriptions, null, 2)
  )
  const reopened = subscriptions[0].body
  const orphan = reopened.items.find((item) => item.id === state.orphanItem)
  assert(
    orphan && !orphan.addedToQueue && !orphan.taskId,
    'Startup did not reconcile the orphan link'
  )
  const retained = reopened.items.find((item) => item.id === 'automatic-retained')
  assert(
    retained?.taskId ===
      state.beforeReopen.find((item) => item.item_id === 'automatic-retained').task_id,
    'Startup lost a valid completed queue link'
  )
  const physical = await stat(path.join(runDir, 'userdata/vidbee.db'))
  const original = await stat(path.join(originalRun, 'userdata/vidbee.db'))
  assert(
    physical.ino === original.ino && physical.dev === original.dev,
    'Restart did not reuse the physical database'
  )
  await record(
    'loopback-subscriptions/reopen',
    normalizeSubscriptionClocks({
      subscriptions,
      samePhysicalDatabase: true,
      orphanReconciled: true,
      validLinkRetained: true
    })
  )
}
