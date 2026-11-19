import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as SqlClient from 'effect/sql/SqlClient'
import { TaskPersistence } from '@vidbee/task-queue/TaskPersistence.service'
import { layerSql } from '@vidbee/task-queue/TaskPersistence.layer'
import { OnlyFansProfiles } from '@vidbee/browser-capture-legacy/onlyfans-profile'
import { TASK_QUEUE_DDL_V1 } from '@vidbee/db/task-queue'
import { PRIORITY_USER, TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { SqlitePersistAdapter, type SqlitePersistOptions, type PersistAdapter } from '@vidbee/task-queue-legacy/persist'

assert.equal(process.version, `v${readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim()}`)
const directory = mkdtempSync(path.join(tmpdir(), 'vidbee-profile-queue-'))
const client = process.env.VIDBEE_QUEUE_DRIVER ?? 'borrowed'
assert.ok(client === 'borrowed' || client === 'node', 'Unknown fixture SQL client')
async function persistence() {
  if (client === 'borrowed') {
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(path.join(directory, 'queue.db'))
    db.exec(TASK_QUEUE_DDL_V1)
    const driver: SqlitePersistOptions['db'] = {
      prepare: (sql) => db.prepare(sql), exec: (sql) => { db.exec(sql) },
      pragma: (sql, options) => db.pragma(sql, options), close: () => db.close(),
      transaction(fn) {
        const tx = db.transaction(fn)
        const forward = (run: (...args: never[]) => unknown) => new Proxy(fn, { apply: (_target, thisArg, args) => Reflect.apply(run, thisArg, args) })
        return Object.assign(forward(tx), { immediate: forward(tx.immediate), deferred: forward(tx.deferred), exclusive: forward(tx.exclusive) })
      }
    }
    return { persist: new SqlitePersistAdapter({ db: driver, ownsConnection: false }),
      stillOpen: () => db.open && db.prepare('SELECT 1 AS alive').get() !== undefined,
      close: async () => { if (db.open) db.close() } }
  }
  // Import the native value driver only in its own process. It never shares a
  // SQLite file or process with the borrowed better-sqlite3 client above.
  const { layer: nodeLayer } = await import('@vidbee/db/node')
  const runtime = ManagedRuntime.make(layerSql.pipe(Layer.provideMerge(nodeLayer(path.join(directory, 'queue.db')))))
  const sql = await runtime.runPromise(SqlClient.SqlClient)
  for (const statement of TASK_QUEUE_DDL_V1.split(';')) if (statement.trim()) runtime.runSync(sql.unsafe(statement).unprepared)
  const service = await runtime.runPromise(TaskPersistence)
  const persist: PersistAdapter = {
    hasTask: async (id) => runtime.runSync(service.hasTask(id)),
    insertTask: async (task) => runtime.runSync(service.insertTask(task)),
    upsertTask: async (input) => runtime.runSync(service.upsertTask(input)),
    upsertTasks: async (input) => runtime.runSync(service.upsertTasks(input)),
    upsertProgress: async (id, progress) => runtime.runSync(service.upsertProgress(id, progress)),
    deleteTask: async (id) => runtime.runSync(service.deleteTask(id)),
    insertAttempt: async (input) => runtime.runSync(service.insertAttempt(input)),
    closeAttempt: async (input) => runtime.runSync(service.closeAttempt(input)),
    appendJournal: async (input) => runtime.runSync(service.appendJournal(input)),
    findOpenSpawns: async () => runtime.runSync(service.findOpenSpawns),
    loadAllTasks: async () => runtime.runSync(service.loadAllTasks),
    loadLatestAttempt: async (id) => runtime.runSync(service.loadLatestAttempt(id)),
    maintenance: async () => runtime.runSync(service.maintenance),
    close: () => runtime.runSync(service.close)
  }
  return { persist, stillOpen: () => runtime.runSync(sql.unsafe('SELECT 1 AS alive')).length === 1,
    close: async () => { await runtime.dispose() } }
}
const host = await persistence()
const persist = host.persist
const queue = new TaskQueueAPI({
  persist, idleQueueKickMs: 0, clock: () => 1000,
  killProcess: () => { throw new Error('Synthetic queue must not kill a process') },
  executor: { run() { return { cancel: async () => undefined, pause: async () => undefined } } }
})
const url = 'https://onlyfans.com/example'
const items = [
  { id: '1', postId: '100', category: 'photos', state: 'available', downloaded: true },
  { id: '2', postId: '101', category: 'videos', state: 'available', downloaded: false },
  { id: '3', postId: '102', category: 'photos', state: 'locked', downloaded: false }
]
writeFileSync(path.join(directory, 'example.json'), JSON.stringify({ username: 'example', creatorUsername: 'creator', profileUrl: url, state: 'complete', updatedAt: 1, pages: 1, items }))
let defaultReads = 0
const profiles = new OnlyFansProfiles(directory, () => { defaultReads += 1; return path.join(directory, 'downloads') })
const destination = path.resolve(directory, 'custom', '..', 'downloads')
const id = (mediaId: string) => `onlyfans_example_${mediaId}_${createHash('sha256').update(destination).digest('hex').slice(0, 16)}`
try {
  assert.deepEqual(await profiles.enqueue(queue, { url, itemIds: ['1', '1', '2'], customDownloadPath: destination }), { count: 2 })
  assert.equal(defaultReads, 0)
  for (const [mediaId, kind, title, mediaPath] of [
    ['1', 'social-media', '@creator · photos · 1', '100/example'],
    ['2', 'video', '@creator · videos · 2', '101/example']
  ]) {
    const task = queue.get(id(mediaId))
    assert.ok(task)
    assert.equal(task.id, id(mediaId)); assert.equal(task.priority, PRIORITY_USER); assert.equal(task.groupKey, 'onlyfans-browser')
    assert.deepEqual(task.input, { kind, url: `https://onlyfans.com/${mediaPath}`, title,
      options: { onlyFansProfile: url, onlyFansMediaId: mediaId, customDownloadPath: destination, ...(mediaId === '1' ? { startedAt: 1000 } : {}) } })
  }
  const stored = await persist.loadAllTasks()
  assert.deepEqual(stored.map((task) => task.id).sort(), [id('1'), id('2')].sort())
  assert.deepEqual(await profiles.enqueue(queue, { url, itemIds: ['2', '1'] }), { count: 0 })
  assert.equal(defaultReads, 2, 'default directory is read separately for every selected item, even skipped tasks')
  await queue.cancel(id('1'))
  assert.equal(queue.get(id('1'))?.status, 'cancelled')
  assert.deepEqual(await profiles.enqueue(queue, { url, itemIds: ['1'] }), { count: 1 })
  assert.equal(queue.get(id('1'))?.status, 'queued')
  await assert.rejects(profiles.enqueue(queue, { url, itemIds: ['3'] }), { message: 'Select available mapped media. Locked and DRM media cannot be downloaded.' })
  await assert.rejects(profiles.enqueue(queue, { url, itemIds: ['999'] }), { message: 'Select available mapped media. Locked and DRM media cannot be downloaded.' })
  const add = queue.add.bind(queue)
  let adds = 0
  const failure = new Error('synthetic second insert rejection')
  queue.add = (input) => { adds += 1; return adds === 2 ? Promise.reject(failure) : add(input) }
  const alternate = path.join(directory, 'second-destination')
  await assert.rejects(profiles.enqueue(queue, { url, itemIds: ['1', '2'], customDownloadPath: alternate }), (error) => error === failure)
  const alternateId = `onlyfans_example_1_${createHash('sha256').update(path.resolve(alternate)).digest('hex').slice(0, 16)}`
  assert.ok(queue.get(alternateId), 'earlier queue mutation survives the later insertion failure')
  assert.ok((await persist.loadAllTasks()).some((task) => task.id === alternateId))
  await queue.stop()
  assert.equal(host.stillOpen(), true, 'SQLite client remains owned and usable by the host after queue stop')
  console.log(JSON.stringify({ node: process.version, client, hostClientStillOpen: true, tasksPersisted: 3, deduplicated: true, retryCancelled: true, partialFailureRetained: true }))
} finally {
  await profiles.stop()
  await queue.stop()
  await host.close()
  rmSync(directory, { recursive: true, force: true })
}
