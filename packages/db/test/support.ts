import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { transformSync } from 'esbuild'
import * as history from '../src/history'
import * as tasks from '../src/task-queue'
import * as subscriptions from '../src/subscriptions'
import * as transcripts from '../src/transcripts'
import * as prompts from '../src/prompt-runs'

export { tasks, subscriptions, transcripts, prompts }
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const migrationsFolder = resolve(root, 'apps/desktop/resources/drizzle')
export const tables = Object.values({ ...history, ...tasks, ...subscriptions, ...transcripts, ...prompts })
  .filter((value) => typeof value === 'object' && value !== null && !Array.isArray(value))
  .map((value) => value as Parameters<typeof getTableConfig>[0])

export const open = () => {
  const raw = new Database(':memory:')
  raw.pragma('foreign_keys = ON')
  return {
    raw,
    db: drizzle(raw),
    exec: (sql: string) => { raw.exec(sql) },
    all: (sql: string) => raw.prepare(sql).all() as Record<string, unknown>[],
    get: (sql: string) => raw.prepare(sql).get() as Record<string, unknown> | undefined,
    close: () => raw.close()
  }
}
export type TestDatabase = ReturnType<typeof open>
export const columns = (db: TestDatabase, table: string) => db.all(`PRAGMA table_info("${table}")`).map((c) => String(c.name))
export const schema = (db: TestDatabase) => db.all("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
  .map((row) => ({ ...row, sql: typeof row.sql === 'string' ? row.sql.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim() : row.sql,
    ...(row.type === 'table' ? { columns: db.all(`PRAGMA table_info("${row.name}")`), foreignKeys: db.all(`PRAGMA foreign_key_list("${row.name}")`) } : {}),
    ...(row.type === 'index' ? { columns: db.all(`PRAGMA index_info("${row.name}")`) } : {}) }))
export const snapshot = (name: string) => JSON.parse(readFileSync(new URL(`./snapshots/${name}.json`, import.meta.url), 'utf8'))
export const drizzleSchema = () => tables.map((table) => {
  const c = getTableConfig(table)
  return { name: c.name,
    columns: c.columns.map((x) => ({ name: x.name, type: x.getSQLType(), notNull: x.notNull, primary: x.primary, autoIncrement: 'autoIncrement' in x ? x.autoIncrement : false, default: x.default ?? null })),
    primaryKeys: c.primaryKeys.map((x) => ({ name: x.getName(), columns: x.columns.map((x) => x.name) })),
    indexes: c.indexes.map((x) => ({ name: x.config.name, unique: x.config.unique, columns: x.config.columns.map((x) => 'name' in x ? x.name : 'SQL'), where: x.config.where ?? null })),
    foreignKeys: c.foreignKeys.map((x) => { const r = x.reference(); return { columns: r.columns.map((x) => x.name), table: getTableConfig(r.foreignTable).name, foreignColumns: r.foreignColumns.map((x) => x.name), onDelete: x.onDelete, onUpdate: x.onUpdate ?? null } }) }
}).sort((a, b) => a.name.localeCompare(b.name))

// Execute only the real desktop migration code, with its Electron boundary replaced.
// No database singleton, settings, application lifecycle, or user profile is imported.
const execute = (source: string, filename: string, bindings: Record<string, unknown>) => {
  const module = { exports: {} }
  const require = createRequire(resolve(root, 'apps/desktop/package.json'))
  const output = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code
  runInNewContext(output, { module, exports: module.exports, require: (id: string) => id === 'electron' ? { app: { getAppPath: () => resolve(root, 'apps/desktop') } } : require(id), process: { cwd: () => resolve(root, 'apps/desktop') }, ...bindings }, { filename })
  return module.exports
}
export const desktopMigrations = () => {
  const filename = resolve(root, 'apps/desktop/src/main/lib/database/migrate.ts')
  const source = readFileSync(filename, 'utf8').replace('import.meta.dirname', JSON.stringify(dirname(filename)))
  return execute(source, filename, {}) as { runMigrations: (db: TestDatabase['db']) => void, reconcileLegacyMigrationState: (db: TestDatabase['raw']) => void }
}
export const desktopSubscriptions = (db: TestDatabase) => {
  const filename = resolve(root, 'apps/desktop/src/main/lib/subscriptions-host.ts')
  const source = readFileSync(filename, 'utf8')
  const start = source.indexOf('const ensureSubscriptionsSchema =')
  const end = source.indexOf('const ensureDirectoryExists =', start)
  if (start < 0 || end < 0) throw new Error('Desktop subscription migration function not found')
  const declaration = source.slice(start, end)
  const result = execute(`export ${declaration}`, filename, {
    getDatabaseConnection: () => ({ sqlite: db.raw }), logger: { info: () => {} }, applySubscriptionsMigrations: subscriptions.applySubscriptionsMigrations
  }) as { ensureSubscriptionsSchema: () => void }
  result.ensureSubscriptionsSchema()
}
export const applyCurrent = (db: TestDatabase) => {
  desktopMigrations().runMigrations(db.db)
  db.exec(tasks.TASK_QUEUE_DDL_V1)
  desktopSubscriptions(db)
  transcripts.applyTranscriptMigrations(db.exec, columns(db, 'transcripts'))
  transcripts.applyTranscriptMigrations(db.exec, columns(db, 'transcripts'), columns(db, 'transcript_segments'))
  prompts.applyPromptRunMigrations(db.exec, columns(db, 'transcript_prompt_runs'))
}
