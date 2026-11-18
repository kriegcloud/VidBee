import path from 'node:path'
import { FIXTURE_IDS as ids } from './build-fixture.mjs'

// Conditional read operations are included even when their tool annotation also permits writes.
export const MCP_READ_TOOLS = [
  'list_tasks',
  'get_task',
  'get_queue_stats',
  'inspect_media_engine',
  'list_download_history',
  'get_app_status',
  'get_settings',
  'get_ai_settings',
  'list_subscriptions',
  'get_subscription',
  'test_subscription',
  'list_subscription_items',
  'list_transcripts',
  'get_transcript',
  'export_transcript',
  'manage_asr_model',
  'list_agent_threads',
  'get_agent_thread',
  'get_agent_message',
  'get_agent_events',
  'get_ai_prompt_run',
  'list_skill_results'
]

export const AUTOMATION_OPERATIONS = [
  'add',
  'get',
  'list',
  'cancel',
  'pause',
  'resume',
  'retry',
  'setMaxConcurrency',
  'setMaxPerGroup',
  'removeFromHistory'
]
export const SUBSCRIPTION_OPERATIONS = [
  'list',
  'get',
  'resolve',
  'add',
  'update',
  'remove',
  'refresh',
  'itemsList',
  'itemsQueue'
]
export const EXTENSION_ROUTES = [
  ['POST', '/token'],
  ['GET', '/video-info'],
  ['GET', '/status'],
  ['POST', '/extension/v1/connect'],
  ['GET', '/extension/v1/wait'],
  ['POST', '/extension/v1/cookies'],
  ...['overview', 'transcript'].flatMap((kind) => [
    ['POST', `/extension/v1/${kind}`],
    ['GET', `/extension/v1/${kind}/unknown`],
    ['POST', `/extension/v1/${kind}/unknown/cancel`]
  ]),
  ['POST', '/extension/v1/chat'],
  ['GET', '/extension/v1/chat/unknown'],
  ['POST', '/extension/v1/chat/unknown'],
  ...['events', 'options'].map((operation) => ['GET', `/extension/v1/chat/unknown/${operation}`]),
  ...['model', 'images', 'export', 'feedback', 'tasks', 'videos', 'media'].map((operation) => [
    'POST',
    `/extension/v1/chat/unknown/${operation}`
  ])
]

export const COVERAGE_GAPS = [
  'Network-dependent downloads, feed discovery and refresh, AI generation, and model downloads have validation/error coverage only.',
  'Successful extension caption extraction and AI overview generation require remote services; unknown-session and invalid-input responses are covered.',
  'The cookie bridge wait route has missing/bad-session coverage; a successful long poll needs a concurrent cookie request.',
  'Rendering exports (PDF, PNG, video mux/burn) are outside the deterministic read contract; transcript text exports are covered in every format.'
]

/** Run cases sequentially: each mutation is immediately followed by its observable read. */
export async function runCases({ mcp, http, profileDir, record }) {
  const call = async (label, tool, args = {}) => {
    const result = await mcp(tool, args)
    await record(`mcp/${tool}/${label}`, result)
    // Preserve the complete wire envelope in the golden; unwrap only for dependent requests.
    return result?.result?.structuredContent?.result ?? result?.structuredContent?.result ?? result
  }
  const request = async (label, method, route, body, auth = 'valid') => {
    const result = await http(method, route, body, auth)
    await record(`http/${label}`, result)
    return result
  }
  const unknown = 'golden-unknown'
  const transcript = { downloadId: ids.completed }
  const thread = { threadId: ids.thread }

  for (const tool of ['get_app_status', 'get_settings', 'get_ai_settings', 'get_queue_stats']) {
    await call('default', tool)
    await call('invalid-extra-property', tool, { unexpected: true })
  }
  await call('default', 'list_tasks')
  const first = await call('page-one', 'list_tasks', { limit: 2 })
  if (first?.nextCursor) {
    await call('page-two', 'list_tasks', { limit: 2, cursor: first.nextCursor })
  }
  for (const status of [
    'queued',
    'running',
    'processing',
    'retry-scheduled',
    'paused',
    'completed',
    'failed',
    'cancelled'
  ]) {
    await call(`status-${status}`, 'list_tasks', { status })
  }
  for (const kind of ['video', 'audio', 'transcription', 'conversion', 'model-download']) {
    await call(`kind-${kind}`, 'list_tasks', { kind })
  }
  await call('query', 'list_tasks', { query: 'Golden' })
  await call('group', 'list_tasks', { groupKey: 'example.invalid' })
  await call('parent', 'list_tasks', { parentId: ids.completed })
  await call('invalid-limit', 'list_tasks', { limit: 0 })
  await call('invalid-cursor', 'list_tasks', { cursor: 'not-a-cursor' })
  for (const key of [
    'completed',
    'audio',
    'paused',
    'failed',
    'cancelled',
    'queued',
    'running',
    'processing',
    'retry'
  ]) {
    await call(key, 'get_task', { id: ids[key] })
  }
  await call('unknown', 'get_task', { id: unknown })
  await call('invalid-id', 'get_task', { id: '' })
  await call('default', 'list_download_history')
  await call('page', 'list_download_history', { offset: 1, limit: 2 })
  await call('query', 'list_download_history', { query: 'Golden' })
  for (const status of [
    'pending',
    'downloading',
    'processing',
    'completed',
    'error',
    'cancelled'
  ]) {
    await call(`status-${status}`, 'list_download_history', { status })
  }
  await call('no-matches', 'list_download_history', { query: unknown })
  await call('invalid-offset', 'list_download_history', { offset: -1 })
  await call('status', 'inspect_media_engine', { action: 'status' })
  await call('probe', 'inspect_media_engine', { action: 'probe', taskId: ids.completed })
  await call('unknown-probe', 'inspect_media_engine', { action: 'probe', taskId: unknown })
  await call('missing-url', 'inspect_media_engine', { action: 'formats' })
  await call('missing-playlist-url', 'inspect_media_engine', { action: 'playlist' })
  await call('status', 'manage_asr_model', { action: 'status' })
  await call('invalid-action', 'manage_asr_model', { action: 'unknown' })

  await call('default', 'list_subscriptions')
  await call('query', 'list_subscriptions', { query: 'Golden' })
  await call('past-end', 'list_subscriptions', { offset: 100 })
  await call('unknown-query', 'list_subscriptions', { query: unknown })
  await call('fixture', 'get_subscription', { id: ids.subscription })
  await call('unknown', 'get_subscription', { id: unknown })
  await call('invalid', 'get_subscription', { id: '' })
  await call('fixture', 'list_subscription_items', { subscriptionId: ids.subscription })
  await call('page', 'list_subscription_items', {
    subscriptionId: ids.subscription,
    offset: 1,
    limit: 1
  })
  await call('unknown', 'list_subscription_items', { subscriptionId: unknown })
  await call('invalid', 'list_subscription_items', { subscriptionId: ids.subscription, limit: 0 })
  await call('invalid-url', 'test_subscription', { url: 'file:///feed.xml' })
  await call('offline-refused', 'test_subscription', { url: 'http://127.0.0.1:1/feed.xml' })

  await call('default', 'list_transcripts')
  await call('query', 'list_transcripts', { query: 'Golden' })
  await call('page', 'list_transcripts', { offset: 1, limit: 1 })
  await call('no-matches', 'list_transcripts', { query: unknown })
  await call('invalid', 'list_transcripts', { limit: 101 })
  await call('fixture', 'get_transcript', transcript)
  await call('words', 'get_transcript', { ...transcript, includeWords: true })
  await call('page', 'get_transcript', { ...transcript, offset: 1, limit: 1 })
  await call('query', 'get_transcript', { ...transcript, query: 'Golden' })
  await call('time-range', 'get_transcript', { ...transcript, startMs: 500, endMs: 2500 })
  await call('no-matches', 'get_transcript', { ...transcript, query: unknown })
  await call('unknown', 'get_transcript', { downloadId: unknown })
  await call('invalid', 'get_transcript', { ...transcript, startMs: -1 })
  for (const format of ['txt', 'md', 'srt', 'vtt', 'json']) {
    await call(format, 'export_transcript', { ...transcript, format })
  }
  for (const style of ['transcript', 'subtitles', 'segments', 'whisper']) {
    await call(`style-${style}`, 'export_transcript', { ...transcript, format: 'md', style })
  }
  for (const grouping of ['words', 'sentences']) {
    await call(`grouping-${grouping}`, 'export_transcript', {
      ...transcript,
      format: 'srt',
      grouping
    })
  }
  await call('page-no-timestamp', 'export_transcript', {
    ...transcript,
    offset: 1,
    limit: 1,
    showTimestamp: false
  })
  await call('unknown', 'export_transcript', { downloadId: unknown })
  await call('invalid-format', 'export_transcript', { ...transcript, format: 'html' })

  await call('default', 'list_agent_threads')
  await call('download', 'list_agent_threads', transcript)
  await call('query', 'list_agent_threads', { query: 'Golden' })
  await call('page', 'list_agent_threads', { offset: 1, limit: 1 })
  await call('no-matches', 'list_agent_threads', { query: unknown })
  await call('fixture', 'get_agent_thread', thread)
  await call('page', 'get_agent_thread', { ...thread, offset: 1, limit: 1 })
  await call('branches', 'get_agent_thread', { ...thread, allBranches: true })
  await call('unknown', 'get_agent_thread', { threadId: unknown })
  await call('invalid', 'get_agent_thread', { ...thread, limit: 0 })
  const message = { ...thread, messageId: ids.message }
  await call('fixture', 'get_agent_message', message)
  await call('thinking', 'get_agent_message', {
    ...message,
    messageId: 'golden-message-assistant',
    includeThinking: true
  })
  await call('page', 'get_agent_message', { ...message, offset: 2, limit: 10 })
  await call('unknown-message', 'get_agent_message', { ...thread, messageId: unknown })
  await call('unknown-thread', 'get_agent_message', { threadId: unknown, messageId: ids.message })
  await call('fixture', 'get_agent_events', thread)
  await call('past-end', 'get_agent_events', { ...thread, after: 10_000 })
  await call('unknown', 'get_agent_events', { threadId: unknown })
  await call('invalid', 'get_agent_events', { ...thread, after: -1 })
  const prompt = { ...transcript, promptId: ids.prompt }
  await call('fixture', 'get_ai_prompt_run', prompt)
  await call('page', 'get_ai_prompt_run', { ...prompt, offset: 5, limit: 10 })
  await call('unknown', 'get_ai_prompt_run', { downloadId: unknown, promptId: unknown })
  await call('invalid', 'get_ai_prompt_run', { ...prompt, limit: 0 })
  await call('fixture', 'list_skill_results', transcript)
  await call('page', 'list_skill_results', { ...transcript, offset: 1, limit: 1 })
  await call('unknown', 'list_skill_results', { downloadId: unknown })

  await call('patch', 'update_settings', {
    theme: 'dark',
    oneClickDownloadType: 'audio',
    subtitleLanguages: ['en', 'fr']
  })
  await call('after-patch', 'get_settings')
  await call('invalid', 'update_settings', { maxConcurrentDownloads: 0 })
  await call('after-invalid', 'get_settings')
  await call('rename', 'manage_task', {
    id: ids.completed,
    action: 'rename',
    name: 'Golden renamed media'
  })
  await call('after-rename', 'get_task', { id: ids.completed })
  await call('invalid-state', 'manage_task', { id: ids.completed, action: 'pause' })
  await call('cancel', 'manage_task', { id: ids.paused, action: 'cancel' })
  await call('after-cancel', 'get_task', { id: ids.paused })
  await call('set', 'configure_queue_group', { groupKey: 'golden-group', limit: 2 })
  await call('after-group-set', 'get_queue_stats')
  await call('clear', 'configure_queue_group', { groupKey: 'golden-group', limit: null })
  await call('after-group-clear', 'get_queue_stats')
  await call('patch', 'update_subscription', {
    id: ids.subscription,
    title: 'Golden renamed feed',
    enabled: false,
    autoDownload: false,
    keywords: ['science'],
    tags: ['golden']
  })
  await call('after-update', 'get_subscription', { id: ids.subscription })
  await call('invalid-create', 'create_subscription', { url: 'file:///feed.xml' })
  await call('after-invalid-create', 'list_subscriptions')
  await call('edit', 'update_transcript_segment', {
    ...transcript,
    segmentId: ids.segment,
    text: 'Golden edited caption.',
    startMs: 100,
    endMs: 900,
    speakerId: ids.speaker
  })
  await call('after-edit', 'get_transcript', { ...transcript, includeWords: true })
  const inserted = await call('insert', 'insert_transcript_segment', {
    ...transcript,
    afterId: ids.segment,
    text: 'Golden inserted caption.'
  })
  await call('after-insert', 'get_transcript', transcript)
  if (!inserted?.segmentId) {
    throw new Error('insert_transcript_segment did not return segmentId')
  }
  if (inserted?.segmentId) {
    await call('delete-inserted', 'delete_transcript_segments', {
      ...transcript,
      segmentIds: [inserted.segmentId]
    })
    await call('after-delete', 'get_transcript', transcript)
  }
  await call('unknown-segment', 'update_transcript_segment', {
    ...transcript,
    segmentId: unknown,
    text: 'No change'
  })
  await call('after-unknown-edit', 'get_transcript', transcript)
  const created = await call('create', 'create_agent_thread', transcript)
  if (!created?.id) {
    throw new Error('create_agent_thread did not return id')
  }
  if (created?.id) {
    const createdThread = { threadId: created.id }
    await call('after-create', 'get_agent_thread', createdThread)
    await call('rename', 'manage_agent_thread', {
      ...createdThread,
      action: 'rename',
      title: 'Golden new conversation'
    })
    await call('after-rename', 'get_agent_thread', createdThread)
    await call('delete', 'manage_agent_thread', { ...createdThread, action: 'delete' })
    await call('after-delete', 'get_agent_thread', createdThread)
  }
  await call('relative-path', 'import_media', { paths: ['relative.wav'] })
  await call('missing-file', 'import_media', {
    paths: [path.join(profileDir, 'golden-media', 'missing.wav')]
  })
  const imported = await call('local-file', 'import_media', {
    paths: [path.join(profileDir, 'golden-media', 'import-sample.wav')]
  })
  const importedId = imported.imported?.[0]?.downloadId
  if (!importedId) {
    throw new Error('Local import did not return a download id')
  }
  // Import always starts ASR. Its network/model lifecycle is outside this case;
  // cancel and remove that child through public tools before snapshotting lists.
  const cancelled = await mcp('manage_transcription', { downloadId: importedId, action: 'cancel' })
  if (cancelled.result?.isError || cancelled.error) {
    throw new Error('Could not cancel imported ASR')
  }
  const children = await mcp('list_tasks', { parentId: importedId })
  for (const child of children.result.structuredContent.result.tasks ??
    children.result.structuredContent.result.items ??
    []) {
    const removed = await mcp('manage_task', { id: child.id, action: 'remove' })
    if (removed.result?.isError || removed.error) {
      throw new Error('Could not remove imported ASR child')
    }
  }
  await call('after-import-children', 'list_tasks', { parentId: importedId })
  await call('after-import', 'list_download_history', { query: 'import-sample' })
  await call('after-import', 'list_tasks', { query: 'import-sample' })

  await runHttpCases({ call, request, ids, unknown })
  await call('remove', 'remove_subscription', { id: ids.subscription })
  await call('after-remove', 'list_subscriptions')
  await call('removed', 'get_subscription', { id: ids.subscription })
}

async function runHttpCases({ call, request, ids, unknown }) {
  const prefix = '/automation/v1'
  for (const route of ['health', 'handshake', 'events', 'stats']) {
    const method = route === 'handshake' ? 'POST' : 'GET'
    for (const auth of ['none', 'bad', 'valid']) {
      await request(`automation/${route}/${auth}`, method, `${prefix}/${route}`, undefined, auth)
    }
    await request(
      `automation/${route}/wrong-method`,
      route === 'handshake' ? 'GET' : 'PUT',
      `${prefix}/${route}`
    )
  }
  for (const operation of AUTOMATION_OPERATIONS) {
    for (const auth of ['none', 'bad']) {
      await request(`automation/${operation}/${auth}`, 'POST', `${prefix}/${operation}`, {}, auth)
    }
  }
  for (const operation of SUBSCRIPTION_OPERATIONS) {
    for (const auth of ['none', 'bad']) {
      await request(
        `subscriptions/${operation}/${auth}`,
        'POST',
        `${prefix}/subscriptions/${operation}`,
        {},
        auth
      )
    }
  }
  for (const [label, operation, body] of [
    ['fixture', 'get', { id: ids.completed }],
    ['unknown', 'get', { id: unknown }],
    ['default', 'list', {}],
    ['page', 'list', { limit: 2 }],
    ['filtered', 'list', { status: 'completed', limit: 2 }],
    ['invalid-add', 'add', { input: { kind: 'unknown' } }],
    ...['cancel', 'pause', 'resume', 'retry', 'removeFromHistory'].map((operation) => [
      'unknown',
      operation,
      { id: unknown }
    ])
  ]) {
    const result = await request(
      `automation/${operation}/${label}`,
      'POST',
      `${prefix}/${operation}`,
      body
    )
    // The current API accepts this malformed input. Pin it, then remove the task
    // before the renderer consumes history (the current UI assumes URL exists).
    if (label === 'invalid-add' && result.body?.id) {
      await request('automation/cancel/malformed-input', 'POST', `${prefix}/cancel`, {
        id: result.body.id
      })
      await request(
        'automation/removeFromHistory/malformed-input',
        'POST',
        `${prefix}/removeFromHistory`,
        { id: result.body.id }
      )
    }
  }
  await request('automation/setMaxConcurrency/set', 'POST', `${prefix}/setMaxConcurrency`, { n: 2 })
  await request('automation/stats/after-concurrency', 'GET', `${prefix}/stats`)
  await request('automation/setMaxPerGroup/set', 'POST', `${prefix}/setMaxPerGroup`, {
    groupKey: 'golden-http',
    n: 1
  })
  await request('automation/stats/after-group', 'GET', `${prefix}/stats`)
  await request('automation/setMaxPerGroup/clear', 'POST', `${prefix}/setMaxPerGroup`, {
    groupKey: 'golden-http',
    n: null
  })
  await request('automation/stats/after-group-clear', 'GET', `${prefix}/stats`)
  await request('automation/unknown-operation', 'POST', `${prefix}/unknown`, {})
  await request('automation/unknown-route', 'GET', `${prefix}/unknown`)
  for (const [operation, body] of [
    ['list', {}],
    ['get', { id: ids.subscription }],
    ['get', { id: unknown }],
    ['resolve', { rawUrl: 'https://example.invalid/feed.xml' }],
    ['add', {}],
    ['update', { id: unknown }],
    ['remove', { id: unknown }],
    ['refresh', { id: unknown }],
    ['itemsList', { subscriptionId: ids.subscription, limit: 1 }],
    ['itemsQueue', { subscriptionId: ids.subscription, itemId: unknown }],
    ['unknown', {}]
  ]) {
    await request(
      `subscriptions/${operation}/${body.id === unknown ? 'unknown' : 'fixture'}`,
      'POST',
      `${prefix}/subscriptions/${operation}`,
      body
    )
  }
  // The low-level automation API saves declared feed metadata without fetching it.
  const added = await request('subscriptions/add/offline', 'POST', `${prefix}/subscriptions/add`, {
    sourceUrl: 'https://example.invalid/golden-new-feed.xml',
    feedUrl: 'https://example.invalid/golden-new-feed.xml',
    platform: 'custom',
    title: 'Golden offline feed',
    enabled: false,
    autoDownload: false
  })
  if (!added.body?.id) {
    throw new Error('Automation subscription add did not return id')
  }
  if (added.body?.id) {
    await request('subscriptions/get/after-add', 'POST', `${prefix}/subscriptions/get`, {
      id: added.body.id
    })
    await request('subscriptions/update/offline', 'POST', `${prefix}/subscriptions/update`, {
      id: added.body.id,
      title: 'Golden changed offline feed'
    })
    await request('subscriptions/get/after-update', 'POST', `${prefix}/subscriptions/get`, {
      id: added.body.id
    })
    await request('subscriptions/remove/offline', 'POST', `${prefix}/subscriptions/remove`, {
      id: added.body.id
    })
    await request('subscriptions/get/after-remove', 'POST', `${prefix}/subscriptions/get`, {
      id: added.body.id
    })
  }

  for (const [index, [method, route]] of EXTENSION_ROUTES.entries()) {
    await request(
      `extension/routes/${index}/no-origin`,
      method,
      route,
      method === 'POST' ? {} : undefined,
      'none'
    )
    await request(
      `extension/routes/${index}/bad-token`,
      method,
      route,
      method === 'POST' ? {} : undefined,
      { kind: 'extension', token: 'bad' }
    )
  }
  const extension = { kind: 'extension' }
  const startToken = async (label) => {
    const result = await request(`extension/token/${label}`, 'POST', '/token', {}, extension)
    if (typeof result.body?.token !== 'string') {
      throw new Error('Extension token endpoint did not return a token')
    }
    return { kind: 'extension', token: result.body.token }
  }
  for (const kind of ['overview', 'transcript', 'chat']) {
    await request(
      `extension/${kind}/preflight`,
      'OPTIONS',
      `/extension/v1/${kind}`,
      undefined,
      extension
    )
    await request(
      `extension/${kind}/invalid-input`,
      'POST',
      `/extension/v1/${kind}`,
      {},
      await startToken(`${kind}-invalid`)
    )
  }
  await request(
    'extension/video-info/missing-url',
    'GET',
    `/video-info?token=${(await startToken('video-info')).token}`,
    undefined,
    extension
  )
  const connected = await request(
    'extension/connect/valid',
    'POST',
    '/extension/v1/connect',
    { browser: 'chrome', clientId: '00000000-0000-4000-8000-000000000001', sites: [] },
    await startToken('connect')
  )
  if (typeof connected.body?.session !== 'string') {
    throw new Error('Extension connect did not return session')
  }
  if (typeof connected.body?.session === 'string') {
    const session = { kind: 'extension', token: connected.body.session }
    await request('extension/cookies/invalid-input', 'POST', '/extension/v1/cookies', {}, session)
    await request(
      'extension/cookies/unknown-request',
      'POST',
      '/extension/v1/cookies',
      { id: '0'.repeat(32), cookies: [] },
      session
    )
    await request(
      'extension/connect/wrong-method',
      'GET',
      '/extension/v1/connect',
      undefined,
      session
    )
    await request('extension/status/connected', 'GET', '/status', undefined, extension)
    await call('extension-connected', 'get_app_status')
  }
  const chat = await request(
    'extension/chat/start',
    'POST',
    '/extension/v1/chat',
    { downloadId: ids.completed },
    await startToken('chat')
  )
  if (!(chat.body?.session?.id && chat.body.session.token)) {
    throw new Error('Extension chat start did not return session')
  }
  if (chat.body?.session?.id && chat.body.session.token) {
    const route = `/extension/v1/chat/${chat.body.session.id}`
    const session = { kind: 'extension', token: chat.body.session.token }
    await request('extension/chat/state', 'GET', route, undefined, session)
    await request('extension/chat/options', 'GET', `${route}/options`, undefined, session)
    await request('extension/chat/events', 'GET', `${route}/events`, undefined, session)
    for (const operation of ['model', 'images', 'export', 'feedback', 'media']) {
      await request(
        `extension/chat/${operation}/invalid`,
        'POST',
        `${route}/${operation}`,
        {},
        session
      )
    }
    for (const operation of ['tasks', 'videos']) {
      await request(
        `extension/chat/${operation}/default`,
        'POST',
        `${route}/${operation}`,
        {},
        session
      )
    }
    await request('extension/chat/invalid-command', 'POST', route, {}, session)
    await request('extension/chat/unknown-route', 'POST', `${route}/unknown`, {}, session)
    await request('extension/chat/wrong-method', 'PUT', route, {}, session)
  }
  await request('unknown-route', 'GET', '/unknown')
  await request('preflight', 'OPTIONS', '/status')
}
