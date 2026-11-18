import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import Database from 'better-sqlite3'
import { TASK_QUEUE_DDL_V1 } from '@vidbee/db/task-queue'
import { TaskQueueAPI } from '@vidbee/task-queue'
import { SqlitePersistAdapter } from '@vidbee/task-queue/persist'
import type { JournalAppendInput, SqlitePersistOptions } from '@vidbee/task-queue/persist'
import { EMPTY_PROGRESS } from '@vidbee/task-queue/types'
import { fakeTimers, task } from './fixtures'

// Real connections only. SQL observations use the driver's public trace callback;
// no adapter statement or private state is accessed.
const database = (t: TestContext, file = false) => {
  const directory = file ? mkdtempSync(join(tmpdir(), 'vidbee-queue-sqlite-')) : null
  const statements: string[] = []
  const db = new Database(directory ? join(directory, 'queue.db') : ':memory:', {
    verbose: (sql) => statements.push(String(sql))
  })
  db.exec(TASK_QUEUE_DDL_V1)
  t.after(() => {
    if (db.open) db.close()
    if (directory) rmSync(directory, { recursive: true, force: true })
  })
  // The old adapter models transaction(fn) as F plus mode methods, whereas
  // better-sqlite3's declarations reconstruct Parameters<F>/ReturnType<F>.
  // Transparent callable proxies retain F's type and forward every invocation
  // to the real driver's transaction variants, without a type assertion.
  const driver: SqlitePersistOptions['db'] = {
    prepare: (sql) => db.prepare(sql),
    exec: (sql) => { db.exec(sql) },
    pragma: (sql, options) => db.pragma(sql, options),
    close: () => db.close(),
    transaction(fn) {
      const tx = db.transaction(fn)
      const forward = (run: (...args: never[]) => unknown) => new Proxy(fn, {
        apply: (_target, thisArg, args) => Reflect.apply(run, thisArg, args)
      })
      return Object.assign(forward(tx), {
        immediate: forward(tx.immediate),
        deferred: forward(tx.deferred),
        exclusive: forward(tx.exclusive)
      })
    }
  }
  return { db, driver, statements }
}

const queueFor = (persist: SqlitePersistAdapter) => new TaskQueueAPI({
  persist,
  ...fakeTimers(),
  idleQueueKickMs: 0,
  clock: () => 100,
  filePresent: () => true,
  killProcess: () => { throw new Error('This fixture must not kill a process') },
  executor: { run() { throw new Error('This fixture must not dispatch') } }
})

const spawn = (taskId: string, attemptId: string, startedAt = 10) => ({
  taskId, attemptId, pid: 123, pidStartedAt: 456, startedAt, rawArgsHash: 'sha256:fixture'
})

const journal = (overrides: Partial<JournalAppendInput> = {}): JournalAppendInput => ({
  ts: 1, op: 'spawn', taskId: 'root', attemptId: 'a', pid: 123,
  pidStartedAt: 456, exitCode: null, signal: null, ...overrides
})

for (const file of [false, true]) {
  test(`SQLite ${file ? 'file' : 'memory'}: pragmas, all task writes and immediate atomic transactions`, async (t) => {
    const { db, driver, statements } = database(t, file)
    const persist = new SqlitePersistAdapter({ db: driver, ownsConnection: false })
    assert.deepEqual(statements.slice(-3), [
      'PRAGMA journal_mode = WAL', 'PRAGMA synchronous = NORMAL', 'PRAGMA foreign_keys = ON'
    ])
    assert.equal(db.pragma('journal_mode', { simple: true }), file ? 'wal' : 'memory')
    assert.equal(db.pragma('synchronous', { simple: true }), 1)
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
    assert.equal(await persist.hasTask('root'), false)
    assert.deepEqual(await persist.loadAllTasks(), [])
    const original = task('root')
    statements.length = 0
    await persist.insertTask(original)
    assert.equal(statements[0], 'BEGIN IMMEDIATE')
    assert.equal(statements.at(-1), 'COMMIT')
    assert.equal(await persist.hasTask('root'), true)
    assert.deepEqual(await persist.loadAllTasks(), [original])
    await assert.rejects(persist.insertTask(original), { name: 'SqliteError', code: 'SQLITE_CONSTRAINT_PRIMARYKEY' })
    assert.equal(statements.at(-1), 'ROLLBACK')

    const progress = { ...EMPTY_PROGRESS, ticks: 7, percent: 0.5 }
    const changed = { ...original, status: 'paused' as const, createdAt: 99, updatedAt: 2 }
    statements.length = 0
    const beforeWrite = Date.now()
    await persist.upsertTask({ task: changed, progress })
    assert.equal(statements[0], 'BEGIN IMMEDIATE')
    assert.equal(statements.at(-1), 'COMMIT')
    const [loaded] = await persist.loadAllTasks()
    assert.ok(loaded)
    // ON CONFLICT preserves created_at, and progress uses SQLite's wall clock,
    // overwriting the caller's updatedAt (at whole-second resolution).
    assert.deepEqual({ ...loaded, updatedAt: 2 }, { ...changed, createdAt: 1, progress })
    assert.equal(loaded.updatedAt % 1000, 0)
    assert.ok(loaded.updatedAt >= Math.floor(beforeWrite / 1000) * 1000)
    assert.ok(loaded.updatedAt <= Date.now())

    await persist.upsertTask({ task: task('insert-via-upsert'), progress })
    statements.length = 0
    await persist.upsertTasks([
      { task: task('root', { status: 'cancelled' }), progress },
      { task: task('batch-new'), progress }
    ])
    assert.equal(statements[0], 'BEGIN IMMEDIATE')
    assert.equal(statements.at(-1), 'COMMIT')
    assert.equal(await persist.hasTask('batch-new'), true)
    await assert.rejects(persist.upsertTasks([
      { task: task('root', { status: 'failed' }), progress },
      { task: task('bad-child', { parentId: 'absent' }), progress }
    ]), { name: 'SqliteError', code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })
    assert.equal((await persist.loadAllTasks()).find((row) => row.id === 'root')?.status, 'cancelled')
    assert.equal(await persist.hasTask('bad-child'), false)
    await persist.upsertTasks([])
    await persist.upsertProgress('root', { ...EMPTY_PROGRESS, ticks: 9 })
    await persist.upsertProgress('absent', progress)
    assert.deepEqual((await persist.loadAllTasks()).find((row) => row.id === 'root')?.progress, { ...EMPTY_PROGRESS, ticks: 9 })
    persist.close()
    assert.equal(db.open, true)
  })
}

test('SQLite attempt numbering uses remaining row count, latest uses number and close writes every field', async (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  await persist.insertTask(task('root', { attempt: 77 }))
  assert.equal(await persist.loadLatestAttempt('root'), null)
  await persist.insertAttempt(spawn('root', 'a', 30))
  await persist.insertAttempt(spawn('root', 'b', 20))
  assert.deepEqual(await persist.loadLatestAttempt('root'), {
    id: 'b', taskId: 'root', attemptNumber: 2, startedAt: 20,
    endedAt: null, exitCode: null, errorCategory: null,
    stdoutTail: null, stderrTail: null, rawArgsHash: 'sha256:fixture'
  })
  await persist.closeAttempt({ taskId: 'ignored-task-id', attemptId: 'b', endedAt: 40,
    exitCode: 3, errorCategory: 'network-transient', stdoutTail: 'stdout', stderrTail: 'stderr' })
  assert.deepEqual(await persist.loadLatestAttempt('root'), {
    id: 'b', taskId: 'root', attemptNumber: 2, startedAt: 20, endedAt: 40,
    exitCode: 3, errorCategory: 'network-transient', stdoutTail: 'stdout', stderrTail: 'stderr', rawArgsHash: 'sha256:fixture'
  })
  await persist.closeAttempt({ taskId: 'root', attemptId: 'missing', endedAt: 50,
    exitCode: null, errorCategory: null, stdoutTail: null, stderrTail: null })
  db.prepare('DELETE FROM attempts WHERE id = ?').run('a')
  await persist.insertAttempt(spawn('root', 'c', 50))
  assert.deepEqual(db.prepare('SELECT attempt_number FROM attempts ORDER BY id').all(), [
    { attempt_number: 2 }, { attempt_number: 2 }
  ])
})

test('SQLite deletes descendants deepest first and attempts, retains the entire journal', async (t) => {
  const { db, driver, statements } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  for (const row of [task('root'), task('child', { parentId: 'root' }),
    task('grandchild', { parentId: 'child' }), task('sibling', { parentId: 'root' }), task('other')]) {
    await persist.insertTask(row)
    await persist.insertAttempt(spawn(row.id, `attempt-${row.id}`))
    await persist.appendJournal(journal({ taskId: row.id }))
  }
  statements.length = 0
  await persist.deleteTask('root')
  assert.equal(statements[0], 'BEGIN IMMEDIATE')
  assert.equal(statements.at(-1), 'COMMIT')
  assert.deepEqual((await persist.loadAllTasks()).map((row) => row.id), ['other'])
  assert.deepEqual(db.prepare('SELECT task_id FROM attempts').all(), [{ task_id: 'other' }])
  assert.equal((await persist.findOpenSpawns()).length, 5)
  await persist.deleteTask('absent')
})

test('SQLite open spawns match later seq, task, pid and null/empty attempt; order is seq not timestamp', async (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  const rows: JournalAppendInput[] = [
    journal({ op: 'close', ts: 999 }), // an earlier close does not close the later spawn
    journal({ ts: 90 }),
    journal({ op: 'close', taskId: 'different' }),
    journal({ op: 'killed', pid: 124 }),
    journal({ op: 'close', attemptId: 'different' }),
    journal({ attemptId: 'closed', ts: 80 }),
    journal({ attemptId: 'closed', op: 'close', exitCode: 0 }),
    journal({ attemptId: 'killed', ts: 70 }),
    journal({ attemptId: 'killed', op: 'killed', signal: 'SIGKILL' }),
    journal({ attemptId: null, ts: 60 }),
    journal({ attemptId: '', op: 'close' }),
    journal({ attemptId: 'late', ts: 10, pidStartedAt: null }),
    journal({ attemptId: 'late', op: 'panic' }) // panic does not close a spawn
  ]
  for (const row of rows) await persist.appendJournal(row)
  assert.deepEqual(await persist.findOpenSpawns(), [
    { seq: 2, ...rows[1] }, { seq: 12, ...rows[11] }
  ])
})

test('SQLite bigint sequence and count values are converted to numbers (including precision loss)', async (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  db.defaultSafeIntegers(true)
  await persist.insertTask(task('root'))
  await persist.insertAttempt(spawn('root', 'a'))
  await persist.insertAttempt(spawn('root', 'b'))
  assert.equal((await persist.loadLatestAttempt('root'))?.attemptNumber, 2n)
  db.prepare('INSERT INTO process_journal (seq, ts, op, task_id, pid) VALUES (?, ?, ?, ?, ?)')
    .run(9007199254740993n, 1, 'spawn', 'root', 123)
  const [row] = await persist.findOpenSpawns()
  assert.ok(row)
  assert.equal(row.seq, 9007199254740992)
  assert.equal(typeof row.seq, 'number')
  // Only seq is normalized: the other integer fields keep the driver's bigint mode.
  assert.equal(row.pid, 123n)
})

test('SQLite maintenance ages strictly older journal rows and swallows a real checkpoint failure', async (t) => {
  const { db, driver, statements } = database(t, true)
  // A zero age makes epoch-old and far-future fixtures independent of wall time.
  const persist = new SqlitePersistAdapter({ db: driver, journalAgeMs: 0 })
  await persist.appendJournal(journal({ ts: 1 }))
  await persist.appendJournal(journal({ ts: 8_000_000_000_000 }))
  await persist.maintenance()
  assert.deepEqual((await persist.findOpenSpawns()).map((row) => row.ts), [8_000_000_000_000])
  assert.ok(statements.includes('PRAGMA wal_checkpoint(TRUNCATE)'))
  db.exec('BEGIN IMMEDIATE')
  try {
    assert.throws(() => db.pragma('wal_checkpoint(TRUNCATE)'), { code: 'SQLITE_LOCKED' })
    await persist.maintenance()
  } finally {
    db.exec('ROLLBACK')
  }
})

test('SQLite default journal age is 30 days and exact cutoff is retained', async (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  const now = 2_000_000_000_000
  t.mock.method(Date, 'now', () => now)
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  for (const ts of [cutoff - 1, cutoff, cutoff + 1]) await persist.appendJournal(journal({ ts }))
  await persist.maintenance()
  assert.deepEqual((await persist.findOpenSpawns()).map((row) => row.ts), [cutoff, cutoff + 1])
})

test('SQLite close owns its connection by default, repeated close errors are swallowed', (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  persist.close()
  assert.equal(db.open, false)
  assert.doesNotThrow(() => persist.close())
})

test('SQLite missing progress defaults; earliest attempt backfills options only when startedAt is nullish', async (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver })
  for (const [id, options] of [
    ['absent', undefined], ['null', { startedAt: null, keep: 'yes' }],
    ['zero', { startedAt: 0 }], ['existing', { startedAt: 99 }]
  ] as const) {
    await persist.insertTask(task(id, { input: { kind: 'video', url: 'https://fixture.invalid', options } }))
    await persist.insertAttempt(spawn(id, `${id}-first`, 30))
    await persist.insertAttempt(spawn(id, `${id}-second`, 10))
  }
  await persist.insertTask(task('no-attempt'))
  db.prepare('UPDATE tasks SET progress_json = NULL WHERE id = ?').run('absent')
  db.prepare("UPDATE tasks SET progress_json = '' WHERE id = ?").run('null')
  const loaded = await persist.loadAllTasks()
  assert.deepEqual(loaded.map((row) => row.input.options), [
    { startedAt: 10 }, { startedAt: 10, keep: 'yes' }, { startedAt: 0 }, { startedAt: 99 }, undefined
  ])
  assert.deepEqual(loaded[0]?.progress, EMPTY_PROGRESS)
  assert.deepEqual(loaded[1]?.progress, EMPTY_PROGRESS)
  // Backfill is a read transformation, not a database write.
  assert.equal(db.prepare<[string], { input_json: string }>('SELECT input_json FROM tasks WHERE id = ?').get('absent')?.input_json,
    '{"kind":"video","url":"https://fixture.invalid"}')
  const queue = queueFor(persist)
  await queue.start()
  assert.deepEqual(queue.get('absent')?.input.options, { startedAt: 10 })
  await queue.stop()
})

const columns = [
  ['input_json', 'input'], ['progress_json', 'progress'],
  ['output_json', 'output'], ['last_error_json', 'lastError']
] as const

for (const [column] of columns) {
  test(`SQLite malformed ${column}: load and start reject with native SyntaxError`, async (t) => {
    const { db, driver } = database(t)
    const persist = new SqlitePersistAdapter({ db: driver, ownsConnection: false })
    await persist.insertTask(task('corrupt'))
    db.prepare(`UPDATE tasks SET ${column} = ? WHERE id = ?`).run('{', 'corrupt')
    const expected = { name: 'SyntaxError', message: "Expected property name or '}' in JSON at position 1 (line 1 column 2)" }
    await assert.rejects(persist.loadAllTasks(), expected)
    const queue = queueFor(persist)
    await assert.rejects(queue.start(), expected)
    assert.equal(queue.get('corrupt'), undefined)
    await queue.stop()
  })
}

for (const [column, field] of columns) {
  for (const value of ['object-expected', null, {}, { kind: 42, url: false, percent: 'wrong', size: 'wrong', retryable: 'wrong' }]) {
    test(`SQLite wrong-shaped ${column} ${JSON.stringify(value)}: ${column === 'input_json' && value === null ? 'throws' : 'loads unchanged'}`, async (t) => {
      const { db, driver } = database(t)
      const persist = new SqlitePersistAdapter({ db: driver, ownsConnection: false })
      await persist.insertTask(task('wrong-shape'))
      db.prepare(`UPDATE tasks SET ${column} = ? WHERE id = ?`).run(JSON.stringify(value), 'wrong-shape')
      const queue = queueFor(persist)
      if (column === 'input_json' && value === null) {
        const expected = { name: 'TypeError', message: "Cannot read properties of null (reading 'options')" }
        await assert.rejects(persist.loadAllTasks(), expected)
        await assert.rejects(queue.start(), expected)
      } else {
        assert.deepEqual((await persist.loadAllTasks())[0]?.[field], value)
        await queue.start()
        assert.deepEqual(queue.get('wrong-shape')?.[field], value)
      }
      await queue.stop()
    })
  }
}

test('SQLite primitive input with an attempt fails when timestamp backfill assigns options', async (t) => {
  const { db, driver } = database(t)
  const persist = new SqlitePersistAdapter({ db: driver, ownsConnection: false })
  await persist.insertTask(task('primitive'))
  await persist.insertAttempt(spawn('primitive', 'a'))
  db.prepare('UPDATE tasks SET input_json = ?').run('"object-expected"')
  const expected = { name: 'TypeError', message: "Cannot create property 'options' on string 'object-expected'" }
  await assert.rejects(persist.loadAllTasks(), expected)
  const queue = queueFor(persist)
  await assert.rejects(queue.start(), expected)
  await queue.stop()
})

test('SQLite unknown keys survive loading, public cancellation transition, save and reload at every object level', async (t) => {
  const { db, driver } = database(t, true)
  const persist = new SqlitePersistAdapter({ db: driver, ownsConnection: false })
  await persist.insertTask(task('open-json', { status: 'paused' }))
  const extra = { future: { nested: [{ child: { keep: 'yes' } }] } }
  const summary = { posts: 1, images: 2, videos: 3, downloaded: 4, existing: 5,
    failed: 0, totalSize: 99, reason: 'exhausted', manifestPath: '/fixture/manifest', startedAt: 1, ...extra }
  const input = { kind: 'video', url: 'https://fixture.invalid', ...extra,
    options: { startedAt: 1, ...extra, agentConversation: { downloadId: 'download', threadId: 'thread', promptId: 'prompt', ...extra } } }
  const progress = { ...EMPTY_PROGRESS, ...extra, collectionSummary: summary }
  const output = { filePath: '/fixture.mp4', size: 99, durationMs: null, sha256: null, ...extra,
    collectionSummary: summary, cookieSources: [{ type: 'browser', browser: 'firefox', ...extra }],
    subtitleAcquisition: { id: 'captions', acquiredAt: 1, ...extra },
    transcript: { resultKind: 'transcript', transcriptId: 'transcript', ...extra } }
  const error = { category: 'network-transient', exitCode: 1, rawMessage: 'fixture', uiMessageKey: 'fixture',
    uiActionHints: ['retry'], retryable: true, suggestedRetryAfterMs: null, ...extra }
  db.prepare('UPDATE tasks SET input_json = ?, progress_json = ?, output_json = ?, last_error_json = ? WHERE id = ?')
    .run(JSON.stringify(input), JSON.stringify(progress), JSON.stringify(output), JSON.stringify(error), 'open-json')
  const queue = queueFor(persist)
  await queue.start()
  assert.deepEqual(queue.get('open-json')?.input, input)
  await queue.cancel('open-json', 'round-trip')
  assert.equal(queue.get('open-json')?.status, 'cancelled')
  const reopened = new SqlitePersistAdapter({ db: driver, ownsConnection: false })
  const [loaded] = await reopened.loadAllTasks()
  assert.ok(loaded)
  assert.deepEqual([loaded.input, loaded.progress, loaded.output, loaded.lastError], [input, progress, output, error])
  const stored = db.prepare<[], Record<string, string>>('SELECT input_json, progress_json, output_json, last_error_json FROM tasks').get()
  assert.ok(stored)
  for (const [column, value] of [['input_json', input], ['progress_json', progress], ['output_json', output], ['last_error_json', error]] as const) {
    assert.deepEqual(JSON.parse(String(stored[column])), value)
  }
  await queue.stop()
})
