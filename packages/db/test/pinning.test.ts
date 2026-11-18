import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getTableColumns } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { applyCurrent, columns, desktopMigrations, desktopSubscriptions, drizzleSchema, migrationsFolder, open, prompts, schema, snapshot, subscriptions, tables, tasks, transcripts } from './support'

const migrationRows = (db: ReturnType<typeof open>) => db.all('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
const pin = (actual: unknown, name: string) => assert.deepEqual(actual, snapshot(name))

// Additive upgrades can append columns in different orders. Compare each result
// to an immutable schema baseline while retaining types/defaults/nullability/PKs,
// foreign keys, and exact index SQL (including predicates and uniqueness).
const pinUpgradedSchema = (db: ReturnType<typeof open>, baseline: string, tableNames: readonly string[]) => {
  const normalize = (rows: readonly Record<string, unknown>[]) => rows.map((row) => {
    const { sql, columns: rawColumns, ...rest } = row
    assert.ok(Array.isArray(rawColumns))
    const normalizedColumns = rawColumns.map((column: Record<string, unknown>) => {
      const { cid, ...fields } = column
      return fields
    })
    if (row.type === 'table') normalizedColumns.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    return { ...rest, ...(row.type === 'index' ? { sql } : {}), columns: normalizedColumns }
  })
  const expected: Record<string, unknown>[] = snapshot(baseline)
  assert.deepEqual(normalize(schema(db)), normalize(expected.filter((row) => tableNames.includes(String(row.tbl_name)))))
}

test('every exported Drizzle table configuration is pinned, including indexes and foreign keys', () => {
  assert.equal(tables.length, 12)
  pin(drizzleSchema(), 'drizzle-tables')
})

const ddlCases = [
  ['task-queue-v1', tasks.TASK_QUEUE_DDL_V1],
  ['subscriptions-v1', subscriptions.SUBSCRIPTIONS_DDL_V1],
  ['transcripts-v1', transcripts.TRANSCRIPT_DDL_V1],
  ['prompt-runs-v1', prompts.PROMPT_RUN_DDL_V1]
] as const
for (const [name, ddl] of ddlCases) test(`${name}: empty schema and second application are pinned`, (t) => {
  const db = open(); t.after(db.close)
  db.exec(ddl)
  const first = schema(db)
  pin(first, name)
  const data = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  db.exec(ddl)
  assert.deepEqual(schema(db), first)
  assert.deepEqual(db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"), data)
  if (name === 'task-queue-v1') assert.deepEqual(db.get('SELECT * FROM schema_meta'), { key: 'task_queue_version', value: '1' })
  if (name === 'subscriptions-v1') assert.deepEqual(db.get('SELECT * FROM subscriptions_meta'), { key: 'subscriptions_version', value: '1', updated_at: 0 })
})

const alterations = [
  ['subscriptions-v2', subscriptions.SUBSCRIPTIONS_DDL_V1, subscriptions.SUBSCRIPTIONS_DDL_V2, 'subscriptions', 'auto_download', 1],
  ['transcripts-v2', transcripts.TRANSCRIPT_DDL_V1, transcripts.TRANSCRIPT_DDL_V2, 'transcripts', 'asr_tier', null],
  ['transcripts-v3', transcripts.TRANSCRIPT_DDL_V1, transcripts.TRANSCRIPT_DDL_V3, 'transcript_segments', 'words_json', null],
  ['transcripts-v4', transcripts.TRANSCRIPT_DDL_V1, transcripts.TRANSCRIPT_DDL_V4, 'transcripts', 'source_kind', null],
  ['prompt-runs-v2', prompts.PROMPT_RUN_DDL_V1, prompts.PROMPT_RUN_DDL_V2, 'transcript_prompt_runs', 'thinking', ''],
  ['prompt-runs-v3', prompts.PROMPT_RUN_DDL_V1, prompts.PROMPT_RUN_DDL_V3, 'transcript_prompt_runs', 'thinking_ms', 0],
  ['prompt-runs-v4', prompts.PROMPT_RUN_DDL_V1, prompts.PROMPT_RUN_DDL_V4, 'transcript_prompt_runs', 'cloud_result_id', null]
] as const
for (const [name, base, ddl, table, column, value] of alterations) test(`${name}: additive DDL schema, row default, and duplicate-column failure`, (t) => {
  const db = open(); t.after(db.close)
  db.exec(base)
  seedRaw(db, table)
  const before = db.get(`SELECT * FROM ${table}`)
  db.exec(ddl)
  assert.deepEqual(db.get(`SELECT * FROM ${table}`), { ...before, [column]: value })
  pin(schema(db), name)
  assert.throws(() => db.exec(ddl), { name: 'SqliteError', message: `duplicate column name: ${column}` })
})

// Seed synthetic values using SQLite's actual required columns, not private fixture data.
function seedRaw(db: ReturnType<typeof open>, table: string) {
  if (table === 'transcript_segments') seedRaw(db, 'transcripts')
  const info = db.all(`PRAGMA table_info(${table})`)
  const names = info.map((c) => String(c.name))
  const values = info.map((c) => c.name === 'transcript_id' ? 'synthetic-id' : c.type === 'INTEGER' ? 1700000000123 : c.notnull || c.pk ? 'synthetic-id' : null)
  db.raw.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...values)
}

test('subscription applier upgrades every supported missing column and preserves populated rows', (t) => {
  const added = ['auto_download', 'download_type', 'download_quality', 'download_container', ...subscriptions.SUBSCRIPTIONS_V3_COLUMNS.map(([name]) => name)]
  for (let mask = 0; mask < 2 ** added.length; mask++) {
    const missing = added.filter((_, bit) => mask & (1 << bit))
    const db = open(); t.after(db.close)
    subscriptions.applySubscriptionsMigrations(db.exec, [])
    for (const column of missing) db.exec(`ALTER TABLE subscriptions DROP COLUMN ${column}`)
    seedRaw(db, 'subscriptions')
    const before = db.get('SELECT * FROM subscriptions')
    subscriptions.applySubscriptionsMigrations(db.exec, columns(db, 'subscriptions'))
    const row = db.get('SELECT * FROM subscriptions')
    for (const [key, value] of Object.entries(before ?? {})) assert.equal(row?.[key], value)
    const defaults: Record<string, unknown> = { auto_download: 1, source_kind: 'feed', categories: '[]' }
    for (const name of missing) assert.equal(row?.[name], defaults[name] ?? null)
    // SQLite appends added columns; normalize by name when comparing different older shapes.
    const actualColumns = db.all('PRAGMA table_info(subscriptions)').map(({ cid, ...c }) => c).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    assert.deepEqual(actualColumns, snapshot('subscriptions-current-columns'))
    pinUpgradedSchema(db, 'fresh-appliers', ['subscriptions', 'subscription_items', 'subscriptions_meta'])
    const upgraded = schema(db)
    subscriptions.applySubscriptionsMigrations(db.exec, columns(db, 'subscriptions'))
    assert.deepEqual(schema(db), upgraded)
    assert.deepEqual(db.get('SELECT * FROM subscriptions'), row)
  }
})

test('subscription version marker preserves timestamps and coexists with task queue metadata', (t) => {
  const db = open(); t.after(db.close)
  db.exec(tasks.TASK_QUEUE_DDL_V1)
  subscriptions.applySubscriptionsMigrations(db.exec, [])
  db.exec("UPDATE subscriptions_meta SET value='old', updated_at=123")
  subscriptions.applySubscriptionsMigrations(db.exec, columns(db, 'subscriptions'))
  assert.deepEqual(db.get('SELECT * FROM subscriptions_meta'), { key: 'subscriptions_version', value: '1', updated_at: 123 })
  assert.deepEqual(db.all('SELECT * FROM schema_meta'), [{ key: 'task_queue_version', value: '1' }])
})

test('prompt applier upgrades all eight older combinations and preserves existing values', (t) => {
  const ddls = [prompts.PROMPT_RUN_DDL_V2, prompts.PROMPT_RUN_DDL_V3, prompts.PROMPT_RUN_DDL_V4]
  for (let mask = 0; mask < 8; mask++) {
    const db = open(); t.after(db.close)
    db.exec(prompts.PROMPT_RUN_DDL_V1)
    ddls.forEach((ddl, bit) => { if (mask & (1 << bit)) db.exec(ddl) })
    seedRaw(db, 'transcript_prompt_runs')
    const before = db.get('SELECT * FROM transcript_prompt_runs')
    prompts.applyPromptRunMigrations(db.exec, columns(db, 'transcript_prompt_runs'))
    const row = db.get('SELECT * FROM transcript_prompt_runs')
    assert.deepEqual(row, { thinking: '', thinking_ms: 0, cloud_result_id: null, ...before })
    pinUpgradedSchema(db, 'current-schema', ['transcript_prompt_runs'])
    const first = schema(db)
    prompts.applyPromptRunMigrations(db.exec, columns(db, 'transcript_prompt_runs'))
    assert.deepEqual(schema(db), first)
    assert.deepEqual(db.get('SELECT * FROM transcript_prompt_runs'), row)
    assert.deepEqual(columns(db, 'transcript_prompt_runs').sort(), drizzleSchema().find((x) => x.name === 'transcript_prompt_runs')?.columns.map((c) => c.name).sort())
  }
})

test('transcript applier upgrades all eight older combinations with segment introspection', (t) => {
  const ddls = [transcripts.TRANSCRIPT_DDL_V2, transcripts.TRANSCRIPT_DDL_V3, transcripts.TRANSCRIPT_DDL_V4]
  for (let mask = 0; mask < 8; mask++) {
    const db = open(); t.after(db.close)
    db.exec(transcripts.TRANSCRIPT_DDL_V1)
    ddls.forEach((ddl, bit) => { if (mask & (1 << bit)) db.exec(ddl) })
    seedRaw(db, 'transcript_segments')
    const before = db.get('SELECT * FROM transcripts')
    const segment = db.get('SELECT * FROM transcript_segments')
    transcripts.applyTranscriptMigrations(db.exec, columns(db, 'transcripts'), columns(db, 'transcript_segments'))
    assert.deepEqual(db.get('SELECT * FROM transcripts'), { asr_tier: null, source_kind: null, ...before })
    assert.deepEqual(db.get('SELECT * FROM transcript_segments'), { words_json: null, ...segment })
    pinUpgradedSchema(db, 'current-schema', ['transcripts', 'transcript_speakers', 'transcript_segments'])
    const first = schema(db)
    transcripts.applyTranscriptMigrations(db.exec, columns(db, 'transcripts'), columns(db, 'transcript_segments'))
    assert.deepEqual(schema(db), first)
  }
})

test('fresh appliers are idempotent with refreshed columns; transcript first-call omission is pinned', (t) => {
  const db = open(); t.after(db.close)
  subscriptions.applySubscriptionsMigrations(db.exec, [])
  prompts.applyPromptRunMigrations(db.exec, [])
  transcripts.applyTranscriptMigrations(db.exec, [])
  pin(schema(db), 'fresh-appliers')
  assert.equal(columns(db, 'transcript_segments').includes('words_json'), false)
  const first = schema(db)
  subscriptions.applySubscriptionsMigrations(db.exec, columns(db, 'subscriptions'))
  prompts.applyPromptRunMigrations(db.exec, columns(db, 'transcript_prompt_runs'))
  transcripts.applyTranscriptMigrations(db.exec, columns(db, 'transcripts'))
  assert.deepEqual(schema(db), first)
  transcripts.applyTranscriptMigrations(db.exec, columns(db, 'transcripts'), columns(db, 'transcript_segments'))
  assert.equal(columns(db, 'transcript_segments').includes('words_json'), true)
})

test('stale introspection arrays retain duplicate-column errors rather than silently changing API', (t) => {
  const db = open(); t.after(db.close)
  subscriptions.applySubscriptionsMigrations(db.exec, [])
  prompts.applyPromptRunMigrations(db.exec, [])
  transcripts.applyTranscriptMigrations(db.exec, [])
  for (const apply of [() => subscriptions.applySubscriptionsMigrations(db.exec, []), () => prompts.applyPromptRunMigrations(db.exec, []), () => transcripts.applyTranscriptMigrations(db.exec, [])]) {
    assert.throws(apply, { name: 'SqliteError' })
  }
})

test('journal hashes, timestamps, schema and desktop migrator parity are pinned', (t) => {
  const db = open(); t.after(db.close)
  migrate(db.db, { migrationsFolder })
  pin(schema(db), 'journal-schema')
  pin(migrationRows(db), 'migration-rows')
  const desktop = open(); t.after(desktop.close)
  desktopMigrations().runMigrations(desktop.db)
  assert.deepEqual(schema(desktop), schema(db))
  assert.deepEqual(migrationRows(desktop), migrationRows(db))
  const before = schema(desktop)
  desktopMigrations().runMigrations(desktop.db)
  assert.deepEqual(schema(desktop), before)
  pin(migrationRows(desktop), 'migration-rows')
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8'))
  assert.deepEqual(journal.entries.map((entry: { tag: string, when: number }) => ({ hash: createHash('sha256').update(readFileSync(`${migrationsFolder}/${entry.tag}.sql`)).digest('hex'), created_at: entry.when })), snapshot('migration-rows'))
})

test('desktop reconciles every older journal state without losing legacy history rows', (t) => {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8'))
  for (let count = 0; count <= journal.entries.length; count++) {
    const db = open(); t.after(db.close)
    for (const entry of journal.entries.slice(0, count)) db.exec(readFileSync(`${migrationsFolder}/${entry.tag}.sql`, 'utf8').split('--> statement-breakpoint').join('\n'))
    if (count > 0) seedRaw(db, 'download_history')
    const before = count > 0 ? db.get('SELECT * FROM download_history') : undefined
    desktopMigrations().runMigrations(db.db)
    pin(schema(db), 'journal-schema')
    pin(migrationRows(db), 'migration-rows')
    if (before) assert.deepEqual(db.get('SELECT * FROM download_history'), { yt_dlp_command: null, yt_dlp_log: null, ...before })
    desktopMigrations().reconcileLegacyMigrationState(db.raw)
    pin(migrationRows(db), 'migration-rows')
  }
})

test('desktop subscription migration renames download_id to task_id once and retains rows/indexes', (t) => {
  const db = open(); t.after(db.close)
  desktopMigrations().runMigrations(db.db)
  seedRaw(db, 'subscription_items')
  db.exec("UPDATE subscription_items SET download_id='synthetic-task'")
  const before = db.get('SELECT * FROM subscription_items')
  desktopSubscriptions(db)
  assert.ok(before)
  const { download_id, ...rest } = before
  assert.deepEqual(db.get('SELECT * FROM subscription_items'), { ...rest, task_id: download_id })
  assert.equal(columns(db, 'subscription_items').includes('download_id'), false)
  pin(schema(db), 'desktop-subscriptions')
  const first = schema(db)
  desktopSubscriptions(db)
  assert.deepEqual(schema(db), first)
})

test('desktop current schema and column-for-column Drizzle drift are pinned explicitly', (t) => {
  const db = open(); t.after(db.close)
  applyCurrent(db)
  pin(schema(db), 'current-schema')
  const differences: unknown[] = []
  for (const table of drizzleSchema()) {
    const actual = db.all(`PRAGMA table_info(${table.name})`)
    assert.deepEqual(actual.map((c) => c.name).sort(), table.columns.map((c) => c.name).sort(), `${table.name}: columns`)
    for (const expected of table.columns) {
      const column = actual.find((c) => c.name === expected.name)
      assert.ok(column)
      assert.equal(String(column.type).toLowerCase(), expected.type, `${table.name}.${expected.name}: type`)
      if (Boolean(column.notnull) !== expected.notNull || (column.dflt_value ?? null) !== (typeof expected.default === 'string' ? `'${expected.default}'` : expected.default === null ? null : String(expected.default))) {
        differences.push({ table: table.name, column: expected.name, drizzle: { notNull: expected.notNull, default: expected.default }, sqlite: { notNull: Boolean(column.notnull), default: column.dflt_value } })
      }
    }
  }
  pin(differences, 'known-column-drift')
})

test('primary keys match and existing foreign-key/index differences remain explicit', (t) => {
  const db = open(); t.after(db.close)
  applyCurrent(db)
  const differences: unknown[] = []
  for (const table of drizzleSchema()) {
    const actualPrimary = db.all(`PRAGMA table_info(${table.name})`).filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((c) => c.name)
    const expectedPrimary = [...table.columns.filter((c) => c.primary).map((c) => c.name), ...table.primaryKeys.flatMap((pk) => pk.columns)]
    assert.deepEqual(actualPrimary, expectedPrimary, `${table.name}: primary key`)
    const actualForeign = db.all(`PRAGMA foreign_key_list(${table.name})`).map((fk) => ({ columns: [fk.from], table: fk.table, foreignColumns: [fk.to], onDelete: String(fk.on_delete).toLowerCase(), onUpdate: String(fk.on_update).toLowerCase() }))
    const expectedForeign = table.foreignKeys.map((fk) => ({ ...fk, onDelete: fk.onDelete ?? 'no action', onUpdate: fk.onUpdate ?? 'no action' }))
    if (JSON.stringify(actualForeign) !== JSON.stringify(expectedForeign)) differences.push({ table: table.name, foreignKeys: { drizzle: expectedForeign, sqlite: actualForeign } })
    const actualIndexes = db.all(`PRAGMA index_list(${table.name})`).filter((idx) => !String(idx.name).startsWith('sqlite_')).map((idx) => ({ name: idx.name, unique: Boolean(idx.unique), columns: db.all(`PRAGMA index_info("${idx.name}")`).map((c) => c.name), partial: Boolean(idx.partial) })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    const expectedIndexes = table.indexes.map((idx) => ({ name: idx.name, unique: idx.unique, columns: idx.columns, partial: idx.where !== null })).sort((a, b) => a.name.localeCompare(b.name))
    for (const idx of actualIndexes) {
      const expected = expectedIndexes.find((candidate) => candidate.name === idx.name)
      if (!expected) differences.push({ table: table.name, extraIndex: idx })
      else if (JSON.stringify(idx) !== JSON.stringify(expected)) differences.push({ table: table.name, index: idx.name, drizzle: expected, sqlite: idx })
    }
    for (const idx of expectedIndexes) assert.ok(actualIndexes.some((candidate) => candidate.name === idx.name), `${table.name}: missing index ${idx.name}`)
  }
  assert.deepEqual(differences, [
    { table: 'process_journal', index: 'idx_journal_open', drizzle: { name: 'idx_journal_open', unique: false, columns: ['op'], partial: false }, sqlite: { name: 'idx_journal_open', unique: false, columns: ['op'], partial: true } },
    { table: 'subscription_items', extraIndex: { name: 'subscription_items_subscription_idx', unique: false, columns: ['subscription_id'], partial: false } },
    { table: 'tasks', foreignKeys: { drizzle: [], sqlite: [{ columns: ['parent_id'], table: 'tasks', foreignColumns: ['id'], onDelete: 'no action', onUpdate: 'no action' }] } },
    { table: 'tasks', index: 'idx_tasks_next_retry', drizzle: { name: 'idx_tasks_next_retry', unique: false, columns: ['next_retry_at'], partial: false }, sqlite: { name: 'idx_tasks_next_retry', unique: false, columns: ['next_retry_at'], partial: true } }
  ])
})

for (const table of tables) test(`${getTableConfig(table).name}: Drizzle/raw round trips preserve values and JS types`, (t) => {
  const db = open(); t.after(db.close)
  applyCurrent(db)
  // Parent rows satisfy the three declared SQLite foreign keys.
  seedRaw(db, 'tasks')
  seedRaw(db, 'transcripts')
  const config = getTableConfig(table)
  const properties = getTableColumns(table)
  const expectedRows: Record<string, unknown>[] = []
  const results: unknown[] = []
  for (const optionalNull of [false, true]) {
    const row: Record<string, unknown> = {}
    const raw: Record<string, unknown> = {}
    for (const [property, column] of Object.entries(properties)) {
      const primary = column.primary || config.primaryKeys.some((pk) => pk.columns.includes(column))
      const isForeign = config.foreignKeys.some((fk) => fk.reference().columns.includes(column)) || (config.name === 'tasks' && column.name === 'parent_id')
      const value = optionalNull && !column.notNull && !primary ? null
        : isForeign ? 'synthetic-id'
        : column.getSQLType() === 'integer' ? optionalNull ? 1700000000124 : 1700000000123
        : column.getSQLType() === 'real' ? 0.875
        : column.name.endsWith('_json') || ['keywords', 'tags', 'categories'].includes(column.name) ? '["synthetic",{"n":1}]'
        : `${config.name}:${column.name}:${optionalNull ? 'nulls' : 'values'}:雪`
      row[property] = value
      raw[column.name] = value
    }
    db.db.insert(table).values(row).run()
    expectedRows.push(row)
    const read = db.db.select().from(table).all().filter((candidate) => expectedRows.some((expected) => Object.entries(expected).every(([key, value]) => candidate[key] === value)))
    assert.deepEqual(read, expectedRows)
    const actualRaw = db.all(`SELECT * FROM ${config.name}`).find((candidate) => Object.entries(raw).every(([key, value]) => candidate[key] === value))
    assert.deepEqual(actualRaw, raw)
    const actualDrizzle = read[read.length - 1]
    assert.ok(actualDrizzle)
    results.push({ drizzle: actualDrizzle, raw: actualRaw, types: Object.fromEntries(Object.entries(actualDrizzle).map(([key, value]) => [key, value === null ? 'null' : typeof value])) })
  }
  pin(results, `roundtrip-${config.name}`)
})
