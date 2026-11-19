import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { SubscriptionsApi } from '@vidbee/subscriptions-core/api'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SUBSCRIPTIONS_DDL_V1, SUBSCRIPTIONS_DDL_V2, SUBSCRIPTIONS_V3_COLUMNS } from '@vidbee/db/subscriptions'
import { createSqliteMetaStore, createSqliteSubscriptionsStore, InMemoryMetaStore } from '@vidbee/subscriptions-core/store'

export const serialize = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => typeof entry === 'bigint' ? { bigint: entry.toString() } : typeof entry === 'number' && !Number.isFinite(entry) ? { nonfinite: String(entry) } : entry, 2)
export const setup = (safe = false, filename = ':memory:') => {
  const statements: string[] = []
  const queries: { sql: string; params: unknown[] }[] = []
  const handle = new Database(filename, { verbose: (sql) => statements.push(String(sql)) })
  handle.exec(SUBSCRIPTIONS_DDL_V1)
  handle.exec(SUBSCRIPTIONS_DDL_V2)
  for (const [column, definition] of SUBSCRIPTIONS_V3_COLUMNS) handle.exec(`ALTER TABLE subscriptions ADD COLUMN ${column} ${definition}`)
  for (const column of ['download_type', 'download_quality', 'download_container']) handle.exec(`ALTER TABLE subscriptions ADD COLUMN ${column} TEXT`)
  handle.defaultSafeIntegers(safe)
  const db = drizzle({ client: handle, logger: { logQuery: (sql, params) => queries.push({ sql, params: [...params] }) } })
  let clock = 100
  let id = 0
  const options = { db, now: () => ++clock, generateId: () => `sub-${++id}` }
  statements.length = 0
  return { handle, db, queries, statements, store: createSqliteSubscriptionsStore(options), meta: createSqliteMetaStore(options) }
}
export const baseInput = { sourceUrl: 'https://fixture.invalid/source', feedUrl: 'https://fixture.invalid/feed', platform: 'custom' as const }
export const item = (id: string, publishedAt = 10) => ({ id, title: `Title ${id}`, url: `https://fixture.invalid/${id}`, publishedAt })
const errorShape = (error: unknown) => {
  assert(error instanceof Error)
  return { name: error.name, message: error.message, code: Reflect.get(error, 'code'), cause: Reflect.get(error, 'cause') }
}
export async function scenario() {
  const { handle, store, meta, queries, statements } = setup()
  const values: Record<string, unknown> = {}
  const markers: string[] = []
  const rows = () => ({ subscriptions: handle.prepare('SELECT * FROM subscriptions ORDER BY id').all(), items: handle.prepare('SELECT * FROM subscription_items ORDER BY subscription_id,item_id').all(), meta: handle.prepare('SELECT * FROM subscriptions_meta ORDER BY key').all() })
  values.empty = await store.list()
  const adding = store.add({ ...baseInput, title: '  Feed  ', keywords: [' one ', '', 'one', 'ONE'], tags: [' x ', 'x'], categories: ['posts'], downloadDirectory: '/fixture/downloads', namingTemplate: '{title}' })
  markers.push(`add-prefix:${handle.prepare('SELECT count(*) AS n FROM subscriptions').pluck().get()}`)
  void adding.then(() => markers.push('add-settled'))
  queueMicrotask(() => markers.push('microtask-after-add'))
  values.add = await adding
  markers.push('add-awaited')
  values.duplicate = [await store.findDuplicateFeed('https://fixture.invalid/feed/'), await store.findDuplicateFeed(baseInput.feedUrl, 'sub-1'), await store.findDuplicateFeed('')]
  values.update = await store.update('sub-1', { sourceUrl: 'https://fixture.invalid/new', autoDownload: false, checkIntervalMs: 12, downloadQuality: 'best' })
  values.missing = [await store.get('absent'), await store.update('absent', {}), await store.remove('absent')]
  await store.replaceItems('sub-1', [item('a', 10), { ...item('b', 20), thumbnail: 'https://fixture.invalid/image' }])
  await store.markItemQueued('sub-1', 'a', 'live')
  values.beforeReplacement = rows()
  await store.replaceItems('sub-1', [item('a', 30), item('c', 40)])
  values.replacement = rows()
  await store.mergeItems('sub-1', [item('a', 50), item('d', 60)])
  await store.mergeItems('sub-1', [])
  await store.markItemQueued('sub-1', 'placeholder', 'dead')
  await store.markItemQueued('sub-1', 'empty', '')
  await store.markItemQueued('sub-1', 'null', null)
  values.merged = rows()
  const beforeRollback = rows()
  try { await store.replaceItems('sub-1', [item('duplicate'), item('duplicate')]) } catch (error) { values.replaceError = errorShape(error) }
  assert.deepEqual(rows(), beforeRollback)
  try { await store.mergeItems('sub-1', [item('new'), item('new')]) } catch (error) { values.mergeError = errorShape(error) }
  assert.deepEqual(rows(), beforeRollback)
  values.clear = [await store.clearQueueLinks({}), await store.clearQueueLinks({ taskIds: [' dead ', 'dead', ''], items: [{ subscriptionId: 'sub-1', itemId: 'a' }, { subscriptionId: 'sub-1', itemId: 'a' }] })]
  await store.markItemQueued('sub-1', 'a', 'live')
  await store.markItemQueued('sub-1', 'd', 'live')
  await store.markItemQueued('sub-1', 'c', 'dead')
  handle.prepare("UPDATE subscription_items SET added=1,task_id=NULL WHERE item_id='null'").run()
  const lookups: string[] = []
  const orphan = store.clearOrphanedQueueLinks((id) => { lookups.push(`${id}:${handle.inTransaction}`); return id === 'live' })
  values.orphanPrefix = [...lookups]
  queueMicrotask(() => lookups.push('marker'))
  values.orphanCount = await orphan
  values.lookups = lookups
  values.afterClear = rows()
  values.metaEmpty = await meta.readLeader()
  await meta.writePreferred('desktop')
  const next = { kind: 'api' as const, pid: 7, startedAt: 1, heartbeatAt: 2, lockExpiresAt: 20, leaseId: 'lease' }
  values.cas = [await meta.casLeader({ expectedLeaseId: null, now: 10, next }), await meta.casLeader({ expectedLeaseId: null, now: 19, next }), await meta.casLeader({ expectedLeaseId: 'wrong', now: 30, next }), await meta.casLeader({ expectedLeaseId: null, now: 20, next: { ...next, leaseId: 'next' } })]
  values.meta = await meta.readLeader()
  await meta.casLeader({ expectedLeaseId: 'next', now: 21, next: { kind: null, pid: null, startedAt: null, heartbeatAt: null, lockExpiresAt: null, leaseId: null } })
  await meta.writePreferred(null)
  values.metaCleared = rows()
  handle.prepare("INSERT INTO subscriptions_meta VALUES ('leader_pid','0x10',0),('leader_started_at','',0),('leader_heartbeat_at','Infinity',0),('leader_kind','unknown',0),('leader_lease_id','',0)").run()
  values.metaCoercion = await meta.readLeader()
  handle.prepare("UPDATE subscriptions SET platform='unknown-platform',status='unknown-status',download_type='unknown-type',download_quality='unknown-quality',download_container='unknown-container',source_kind='unknown-source',keywords='[\" x \",\"x\",\"X\"]',tags='[\"ok\",3]',categories='not-json',only_latest=2,enabled=-1,cover_url='',profile_owner='',check_interval_ms=0,next_check_at=0,latest_video_published_at=0,last_checked_at=0,last_success_at=0").run()
  values.permissive = await store.get('sub-1')
  values.removed = await store.remove('sub-1')
  values.final = rows()
  values.markers = markers
  handle.close()
  return { values, queries, statements }
}

export async function safeScenario() {
  const { handle, store, meta } = setup(true)
  await store.add({ ...baseInput, enabled: true, autoDownload: true, onlyDownloadLatest: true, checkIntervalMs: 9 })
  await store.replaceItems('sub-1', [item('a')])
  await store.markItemQueued('sub-1', 'a', 'task')
  await store.markItemQueued('sub-1', 'missing-link', null)
  handle.prepare("UPDATE subscription_items SET added=1 WHERE item_id='missing-link'").run()
  handle.prepare('UPDATE subscriptions SET created_at=?,next_check_at=?,latest_video_published_at=0,last_checked_at=0,last_success_at=0').run(9007199254740993n, 9007199254740993n)
  await meta.writePreferred('api')
  const old = await store.get('sub-1')
  const raw = { rule: handle.prepare('SELECT * FROM subscriptions').get(), item: handle.prepare('SELECT * FROM subscription_items').get(), meta: handle.prepare('SELECT * FROM subscriptions_meta ORDER BY key').all() }
  assert(old)
  const expectedNew = { ...old, createdAt: Number(old.createdAt), updatedAt: Number(old.updatedAt), checkIntervalMs: Number(old.checkIntervalMs), nextCheckAt: Number(old.nextCheckAt), latestVideoPublishedAt: Number(old.latestVideoPublishedAt), lastCheckedAt: Number(old.lastCheckedAt), lastSuccessAt: Number(old.lastSuccessAt), onlyDownloadLatest: true, autoDownload: true, enabled: true, items: old.items.map((entry) => ({ ...entry, publishedAt: Number(entry.publishedAt), addedToQueue: true })) }
  const result = { old, raw, leader: await meta.readLeader(), orphan: await store.clearOrphanedQueueLinks(() => false), modeSurvives: typeof handle.prepare('SELECT 1').pluck().get(), expectedNew, expectedNewOrphanCount: 2 }
  handle.close()
  return result
}

export async function memoryScenario() {
  const store = new InMemoryMetaStore()
  const initial = await store.readLeader()
  initial.leaseId = 'mutated-copy'
  await store.writePreferred('api')
  const next = { kind: 'desktop' as const, pid: 1, startedAt: 2, heartbeatAt: 3, lockExpiresAt: null, leaseId: 'lease' }
  return { copy: await store.readLeader(), cas: [await store.casLeader({ expectedLeaseId: null, now: 1, next }), await store.casLeader({ expectedLeaseId: null, now: 100, next }), await store.casLeader({ expectedLeaseId: 'lease', now: 0, next: { ...next, leaseId: 'next' } })], final: await store.readLeader() }
}

export async function failureScenario() {
  const results: Record<string, unknown> = {}
  for (const paramsInErrors of [false, true]) {
    const { handle } = setup()
    let calls = 0
    const logged: { sql: string; params: unknown[] }[] = []
    const db = drizzle({ client: handle, paramsInErrors, logger: { logQuery: (sql, params) => { calls++; logged.push({ sql, params: [...params] }) } } })
    const store = createSqliteSubscriptionsStore({ db, now: () => 1, generateId: () => 'same' })
    await store.add(baseInput)
    try { await store.add(baseInput) } catch (error) { results[`constraint-${paramsInErrors}`] = { error: errorShape(error), logged: [...logged] } }
    handle.exec('DROP TABLE subscriptions')
    calls = 0
    try { await store.get('same') } catch (error) { results[`preparation-${paramsInErrors}`] = { error: errorShape(error), calls } }
    handle.close()
  }
  {
    const { handle } = setup()
    const sentinel = { logger: 'sentinel' }
    let calls = 0
    const db = drizzle({ client: handle, logger: { logQuery: () => { calls++; throw sentinel } } })
    const store = createSqliteSubscriptionsStore({ db, now: () => 1, generateId: () => 'logger' })
    let promise: Promise<unknown> | undefined
    assert.doesNotThrow(() => { promise = store.add(baseInput) })
    assert(promise)
    await assert.rejects(promise, (error: unknown) => error === sentinel)
    results.throwingLogger = { calls, rows: handle.prepare('SELECT * FROM subscriptions').all(), rejectionIdentity: true }
    handle.close()
  }
  {
    const { handle } = setup()
    const events: unknown[] = []
    let reentered = false
    let store: ReturnType<typeof createSqliteSubscriptionsStore>
    const db = drizzle({ client: handle, logger: { logQuery: (sql, params) => {
      events.push({ sql, params, inTransaction: handle.inTransaction })
      if (!reentered && sql.startsWith('insert into "subscriptions"')) {
        reentered = true
        events.push({ beforeInsert: handle.prepare('SELECT count(*) FROM subscriptions').pluck().get() })
        const reading = store.list()
        events.push('reentry-returned')
        void reading.then((rows) => events.push({ reentryRows: rows }))
      }
    } } })
    store = createSqliteSubscriptionsStore({ db, now: () => 1, generateId: () => 'reentrant' })
    const adding = store.add(baseInput)
    events.push('add-returned')
    queueMicrotask(() => events.push('marker'))
    await adding
    events.push('awaited')
    results.reentrantLogger = events
    handle.close()
  }
  {
    const { handle, db, store, statements } = setup()
    await store.add(baseInput)
    await store.replaceItems('sub-1', [item('old')])
    statements.length = 0
    let pending: Promise<void> | undefined
    db.transaction(() => { pending = store.replaceItems('sub-1', [item('host')]); results.hostPrefix = handle.prepare('SELECT item_id FROM subscription_items').pluck().all() })
    await pending
    results.hostTransaction = [...statements]
    handle.exec('BEGIN')
    try { await store.replaceItems('sub-1', [item('raw')]) } catch (error) { results.rawTransactionError = errorShape(error) }
    results.rawTransactionRetained = handle.inTransaction
    handle.exec('ROLLBACK')
    results.rawRows = handle.prepare('SELECT * FROM subscription_items').all()
    handle.close()
    const closedStore = createSqliteSubscriptionsStore({ db })
    results.closedConstruction = true
    try { await closedStore.list() } catch (error) { results.closedError = errorShape(error) }
  }
  return results
}

export async function limitScenario() {
  const { handle, store } = setup()
  await store.add({ ...baseInput, sourceKind: 'profile' })
  await store.add(baseInput)
  const entries = Array.from({ length: 302 }, (_, n) => item(`item-${n}`, n))
  await store.replaceItems('sub-1', entries)
  await store.replaceItems('sub-2', entries)
  const result = { list: await store.list(), profileGet: await store.get('sub-1'), feedGet: await store.get('sub-2') }
  assert.equal(result.list.find((rule) => rule.id === 'sub-1')?.items.length, 300)
  assert.equal(result.profileGet?.items.length, 302)
  assert.equal(result.feedGet?.items.length, 302)
  handle.close()
  return result
}

export async function invalidRowScenario() {
  const result: Record<string, unknown> = {}
  for (const [name, mutation, expectedNewPath] of [
    ['nonfinite', 'UPDATE subscriptions SET updated_at=1e999', 'subscriptions.updatedAt'],
    ['blob', "UPDATE subscriptions SET title=x'0102'", 'subscriptions.title'],
    ['null-primary-key', 'UPDATE subscriptions SET id=NULL', 'subscriptions.id'],
    ['real-numeric', 'UPDATE subscriptions SET created_at=1.5,only_latest=1.5', null],
    ['item-nonfinite', 'UPDATE subscription_items SET published_at=1e999', 'subscription_items.publishedAt'],
    ['meta-nonfinite', 'UPDATE subscriptions_meta SET updated_at=1e999', 'subscriptions_meta.updatedAt']
  ] as const) {
    const { handle, store, meta } = setup()
    await store.add(baseInput)
    await store.replaceItems('sub-1', [item('a')])
    handle.exec(mutation)
    result[name] = { old: await store.list(), oldMeta: await meta.readLeader(), rawMeta: handle.prepare('SELECT * FROM subscriptions_meta').all(), expectedNewPath }
    handle.close()
  }
  const recoveries: unknown[] = []
  for (const value of ['', 'null', 'false', '123', '"scalar"', '{}', '{', '[]', '[" a ","a","A",""]', '["before",null]', '["before",{}]']) {
    const { handle, store } = setup()
    await store.add(baseInput)
    handle.prepare('UPDATE subscriptions SET keywords=?,tags=?,categories=?').run(value, value, value)
    recoveries.push({ input: value, old: await store.get('sub-1') })
    handle.close()
  }
  result.listRecovery = recoveries
  return result
}

export async function timingScenario() {
  const { handle, store, meta, queries } = setup()
  const result: Record<string, unknown> = {}
  const check = async (name: string, action: () => Promise<unknown>) => {
    const markers: string[] = []
    const before = queries.length
    const promise = action()
    markers.push('returned')
    const prefix = queries.slice(before)
    void promise.then(() => markers.push('settled'), () => markers.push('rejected'))
    queueMicrotask(() => markers.push('marker-1'))
    queueMicrotask(() => queueMicrotask(() => markers.push('marker-2')))
    const value = await promise
    markers.push('awaited')
    result[name] = { prefix, markers, value }
  }
  await check('add', () => store.add(baseInput))
  await check('list', () => store.list())
  await check('get', () => store.get('sub-1'))
  await check('duplicate', () => store.findDuplicateFeed(baseInput.feedUrl))
  await check('update', () => store.update('sub-1', { title: 'updated' }))
  await check('replace', () => store.replaceItems('sub-1', [item('a')]))
  await check('merge', () => store.mergeItems('sub-1', [item('b')]))
  await check('mark', () => store.markItemQueued('sub-1', 'a', 'task'))
  await check('clear', () => store.clearQueueLinks({ taskIds: ['task'] }))
  await store.markItemQueued('sub-1', 'a', 'task')
  await check('orphan', () => store.clearOrphanedQueueLinks(() => false))
  await check('readLeader', () => meta.readLeader())
  await check('writePreferred', () => meta.writePreferred('desktop'))
  await check('readPreferred', () => meta.readPreferred())
  await check('cas', () => meta.casLeader({ expectedLeaseId: null, now: 1, next: { kind: 'api', pid: 2, startedAt: 3, heartbeatAt: 4, lockExpiresAt: 5, leaseId: 'lease' } }))
  await check('remove', () => store.remove('sub-1'))
  handle.close()
  return result
}

export async function transactionFailureScenario() {
  const { handle, store, meta, statements } = setup()
  await store.add(baseInput)
  await store.replaceItems('sub-1', [item('a'), item('b')])
  await store.markItemQueued('sub-1', 'a', 'task-a')
  await store.markItemQueued('sub-1', 'b', 'task-b')
  const original = handle.prepare('SELECT * FROM subscription_items ORDER BY item_id').all()
  handle.exec("CREATE TRIGGER reject_second BEFORE UPDATE ON subscription_items WHEN NEW.item_id='b' BEGIN SELECT RAISE(ABORT,'second update refused'); END")
  statements.length = 0
  let clearError: unknown
  try { await store.clearQueueLinks({ items: [{ subscriptionId: 'sub-1', itemId: 'a' }, { subscriptionId: 'sub-1', itemId: 'b' }] }) } catch (error) { clearError = errorShape(error) }
  const afterClear = handle.prepare('SELECT * FROM subscription_items ORDER BY item_id').all()
  assert.deepEqual(afterClear, original)
  const clearTrace = [...statements]
  handle.exec("CREATE TRIGGER reject_pid BEFORE INSERT ON subscriptions_meta WHEN NEW.key='leader_pid' BEGIN SELECT RAISE(ABORT,'pid refused'); END")
  const originalMeta = handle.prepare('SELECT * FROM subscriptions_meta ORDER BY key').all()
  statements.length = 0
  let casError: unknown
  try { await meta.casLeader({ expectedLeaseId: null, now: 1, next: { kind: 'api', pid: 2, startedAt: 3, heartbeatAt: 4, lockExpiresAt: 5, leaseId: 'lease' } }) } catch (error) { casError = errorShape(error) }
  const afterMeta = handle.prepare('SELECT * FROM subscriptions_meta ORDER BY key').all()
  assert.deepEqual(afterMeta, originalMeta)
  const result = { clearError, original, afterClear, clearTrace, casError, originalMeta, afterMeta, metaTrace: [...statements] }
  handle.close()
  return result
}

export async function apiSqlFailureScenario() {
  const result: Record<string, unknown> = {}
  for (const failure of ['replacement', 'link'] as const) {
    const { handle, store, meta, statements, queries } = setup()
    await store.add({ ...baseInput, onlyDownloadLatest: false })
    await store.replaceItems('sub-1', [item('old')])
    if (failure === 'replacement') handle.exec("CREATE TRIGGER reject_replacement BEFORE INSERT ON subscription_items WHEN NEW.item_id='new' BEGIN SELECT RAISE(ABORT,'replacement refused'); END")
    else handle.exec("CREATE TRIGGER reject_link BEFORE UPDATE ON subscription_items WHEN NEW.added=1 BEGIN SELECT RAISE(ABORT,'link refused'); END")
    const events: unknown[] = []
    const api = new SubscriptionsApi({ kind: 'desktop', pid: 1, store, metaStore: meta, now: () => 1000,
      fetcher: { fetch: async (url) => { events.push({ fetch: url }); return { title: 'Feed title', items: [{ guid: 'new', title: 'New item', link: 'https://fixture.invalid/new', isoDate: '2020-01-01T00:00:00.000Z' }] } } },
      enqueueItem: async (context) => { events.push({ enqueue: context }); return 'new-task' },
      log: (level, message, metadata) => {
        const error = metadata !== null && typeof metadata === 'object' ? Reflect.get(metadata, 'err') : undefined
        events.push({ level, message, metadata: metadata !== null && typeof metadata === 'object' ? { ...metadata, err: errorShape(error) } : metadata })
      }
    })
    api.on('changed', () => events.push({ changed: handle.prepare('SELECT status,last_error FROM subscriptions').all() }))
    statements.length = 0
    queries.length = 0
    await api.refreshOne('sub-1')
    const final = await store.get('sub-1')
    await api.stop()
    result[failure] = { events, final, raw: handle.prepare('SELECT * FROM subscription_items ORDER BY item_id').all(), queries: [...queries], statements: [...statements], handleSurvivesStop: handle.open }
    handle.close()
  }
  return result
}

export async function reopenScenario() {
  const directory = mkdtempSync(join(tmpdir(), 'subscriptions-store-'))
  const filename = join(directory, 'reopen.db')
  const previousMask = process.umask(0o077)
  try {
    const { handle, store, meta } = setup(false, filename)
    await store.add({ ...baseInput, sourceKind: 'profile', categories: ['posts'], downloadType: 'audio' })
    await store.replaceItems('sub-1', [item('saved')])
    await store.markItemQueued('sub-1', 'saved', 'saved-task')
    await meta.writePreferred('desktop')
    const before = { rule: await store.get('sub-1'), leader: await meta.readLeader() }
    handle.close()
    const reopened = new Database(filename)
    const db = drizzle({ client: reopened })
    const reading = createSqliteSubscriptionsStore({ db })
    const readingMeta = createSqliteMetaStore({ db })
    const after = { rule: await reading.get('sub-1'), leader: await readingMeta.readLeader() }
    assert.deepEqual(after, before)
    const integrity = reopened.pragma('integrity_check', { simple: true })
    reopened.close()
    return { before, after, integrity, residue: readdirSync(directory).sort(), mode: statSync(filename).mode & 0o777 }
  } finally {
    process.umask(previousMask)
    rmSync(directory, { recursive: true, force: true })
  }
}
