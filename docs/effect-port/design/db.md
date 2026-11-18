# Design: `@vidbee/db` (phase 3)

Status: draft for review. Design gate per plan decision D14 as amended on 2026-11-17: drafted by the
orchestrator, reviewed by an independent session, findings resolved below, then implemented.

Inputs: the phase 3 spike and pinning inventory in [reports/3.md](../reports/3.md).

## 1. What the package is today

638 lines, five entries, no code that opens a database:

| Entry | Holds |
| --- | --- |
| `./history` | Drizzle table `download_history`, row types |
| `./task-queue` | Drizzle tables `tasks`, `attempts`, `process_journal`, `schema_meta`; `TASK_QUEUE_DDL_V1` |
| `./subscriptions` | Drizzle tables `subscriptions`, `subscription_items`, `subscriptions_meta`; DDL constants; `applySubscriptionsMigrations(exec, columns)` |
| `./transcripts` | Drizzle tables `transcripts`, `transcript_segments`, `transcript_speakers`; DDL constants; `applyTranscriptMigrations(exec, columns…)` |
| `./prompt-runs` | Drizzle table `transcript_prompt_runs`; DDL constants; `applyPromptRunMigrations(exec, columns)` |

The one database file, `vidbee.db`, is opened by the desktop main process with `better-sqlite3`.
That handle, or others on the same file, is used by `task-queue`, `subscriptions-core`,
`transcription`, about ten desktop stores and (from a second process) the CLI. The appliers take an
`exec` callback and a list of existing columns from the caller.

## 2. Decision D30, applied

The spike's findings that decide it:

1. `node:sqlite` through `@effect/sql-sqlite-node` works as the only driver of a process: same row
   content and JS types as `better-sqlite3` on the fixture and on a copy of the owner's database,
   on Electron 43 (Node 24), Node 22.23.4 and Bun 1.4.4; transactions and savepoints behave;
   `Effect.runSync` works on it; the read shapes the app runs at startup stay within 2x.
2. `node:sqlite` and `better-sqlite3` **cannot share a file inside one process**. With one handle
   of each on the same WAL file, a writer is admitted while the other holds a write transaction, and
   an acknowledged insert is lost after commit and reopen. Two handles of the same driver, or the
   two drivers in separate processes, block correctly.
3. A `SqlClient` built over an existing `better-sqlite3` handle with `effect/sql`'s public
   constructors is small and runs synchronously.

The port is gradual (D8, D9): unported code keeps holding `better-sqlite3` handles until the
desktop capability phases. Finding 2 therefore rules out introducing `node:sqlite` in the desktop
process before the last such holder is ported.

**Decision.**

- Ported code depends only on `effect/sql`'s `SqlClient`. It never imports a driver.
- **During the transition** the desktop process keeps exactly one driver, `better-sqlite3`. A
  ported package receives the host's existing handle through its legacy facade and wraps it with
  the adapter of section 4.2. No second connection is opened.
- **Cutover.** `node:sqlite` is the target. When no code in the desktop process holds a raw
  `better-sqlite3` handle any more (expected in phase 9.5 or 10), the composition root swaps the
  adapter layer for `@effect/sql-sqlite-node`'s layer in one change, gated by the golden suite, a
  packaged launch on a copy of the owner's database, the startup read timings, and a rollback
  check. If that gate passes, `better-sqlite3` leaves the repo. If it fails, `better-sqlite3`
  stays behind the adapter and the phase report quotes this section and the spike's question 3.
- The CLI runs in its own process, where mixing is safe. Whether it moves to `node:sqlite` is
  decided in phase 8 (Node 22 prints an `ExperimentalWarning` on first use, and the CLI's stderr is
  part of its surface).

Rejected: opening a second `node:sqlite` connection next to the host's handle (finding 2);
deciding today to keep `better-sqlite3` for good (the spike gives no reason once it is the only
driver left); a `better-sqlite3`-shaped shim over `node:sqlite` so that unported code could switch
early (it would put new, untested code under every unported store at once).

## 3. Schemas

### 3.1 Tables stay Drizzle tables

The twelve `sqliteTable` definitions keep their file, names and column definitions, moved to
Drizzle 1.0.0-rc.5 (section 6). They remain the source of truth for column names and SQL types.
The pinning tests record eight places where a Drizzle object and the real schema disagree
(nullability flags, a missing default, a missing self-reference, two partial indexes). Those are
written down, not changed (assumption A2).

### 3.2 Row models

Every table gets a row schema next to it, in `History.model.ts`, `TaskQueue.model.ts`,
`Subscriptions.model.ts`, `Transcripts.model.ts`, `PromptRuns.model.ts`:

```ts
// History.model.ts (shape, not final code)
export class DownloadHistoryRow extends S.Class<DownloadHistoryRow>("@vidbee/db/DownloadHistoryRow")({
  id: S.String,
  url: S.String,
  title: S.String,
  thumbnail: S.NullOr(S.String),
  // … one field per column, in the table's property names (camelCase)
  downloadedAt: S.Number,
  playlistSize: S.NullOr(S.Number),
}) {}
export declare namespace DownloadHistoryRow {
  export type Encoded = { /* the same fields as SQLite returns them */ }
}
```

Rules for these models:

- **One model per table, in the Drizzle property names.** A second schema per table,
  `…RowFromSql`, decodes the snake_case row that raw SQL returns into the same class. Most
  existing queries are raw SQL, so both shapes are needed.
- **Columns are typed as the database stores them, no narrower.** `status`, `kind`, `type` and the
  other enumerated columns are `text` with no `CHECK` constraint, so here they are `S.String`.
  Narrowing them to literal kits is the job of the package that owns the meaning (`task-queue`
  for task status, and so on), in its own phase. Likewise the `*_json` columns are `S.String` here;
  their owners decode them with `S.fromJsonString(...)`.
- **Integers are JS numbers** (`S.Number`, or `S.Int` where the pinned round trips show only
  integers). `node:sqlite` throws on integers above 2^53 unless big-int reads are on, and
  `better-sqlite3` silently rounds; no column holds such a value today (spike question 2). The
  client is configured for number reads, and the model rejects non-finite numbers.
- **A compile-time check ties each model to its table**: the model's `Type` must be assignable to
  and from the table's `$inferSelect`. A column added to one and not the other fails `tsrs`.
  `drizzle-orm/effect-schema` exists in 1.0-rc; the implementation may derive the models from the
  tables with it if it produces Effect v4 schemas that pass the rule set, and otherwise writes them
  by hand under the same check.
- **Insert shapes** are derived, not written twice: `…Insert` is the model with the columns that
  have defaults made optional, checked against `$inferInsert` the same way.

### 3.3 Errors

```ts
export class DbMigrationError extends S.TaggedError<DbMigrationError>()("DbMigrationError", {
  migration: MigrationName,        // LiteralKit: "task-queue", "subscriptions", "transcripts", "prompt-runs"
  step: S.String,                  // for example "v3: add thinking_ms"
  cause: S.Defect,                 // the SqlError
}) {}
export class DbRowDecodeError extends S.TaggedError<DbRowDecodeError>()("DbRowDecodeError", {
  table: TableName,                // LiteralKit of the twelve table names
  issue: S.String,                 // formatted schema issue, without row content
}) {}
```

Query failures are `effect/sql`'s own `SqlError`; the package does not wrap it.

## 4. Services

### 4.1 The contract is `SqlClient`

There is no VidBee-specific database service for running SQL. Ported packages write
`Effect<…, SqlError | …, SqlClient.SqlClient>`. The reason is the cutover in section 2: the less
VidBee-specific surface sits between a consumer and the client, the smaller that change is.

### 4.2 `BetterSqliteClient` (transition driver)

`BetterSqlite.driver.ts`. The only file in ported code that touches `better-sqlite3`.

```ts
/** A SqlClient over a better-sqlite3 handle that the caller opened and will close. */
export const layerFromHandle: (
  handle: BetterSqlite3.Database,
  options?: { readonly spanAttributes?: ReadonlyArray<readonly [string, unknown]> }
) => Layer.Layer<SqlClient.SqlClient | SqliteClient.SqliteClient>
```

Contract:

- **Borrowed lifetime.** It never opens, closes, checkpoints or reconfigures the handle. Pragmas
  (WAL, `foreign_keys`, `busy_timeout`) are whatever the host set. Disposing the layer releases
  only its prepared-statement cache.
- **Synchronous.** Every statement runs with the handle's synchronous API inside `Effect.try`-style
  wrappers; nothing in the client yields to the event loop. An effect that only does `SqlClient`
  work on it can be run with `runSync`, which the synchronous legacy facades of later phases need.
- **Transactions compose with the host's.** Unported code may call into a facade from inside its
  own `handle.transaction(() => …)`. `withTransaction` therefore checks `handle.inTransaction`: at
  depth zero inside a host transaction it uses a savepoint, not `BEGIN`; otherwise `BEGIN` /
  `COMMIT` / `ROLLBACK`, and savepoints when nested, as `SqlClient.makeSqliteAcquirers` does.
- **Same values as today.** Number reads (no safe-integer mode), `null` for SQL NULL, `Buffer`
  for blobs, the same `SqliteError` code and message carried as the `SqlError` cause.
- It is provided under both the generic `SqlClient` tag and `@effect/sql-sqlite-node`'s
  `SqliteClient` tag, because `drizzle-orm/effect-sqlite-node` asks for the latter. Operations the
  borrowed handle cannot honor (`backup`, `export`, `loadExtension`) fail with a tagged
  `SqlError`; nothing uses them.
- `stream` materializes the rows and emits them (the standard node client does not implement
  `stream` at all).

### 4.3 `NodeSqliteClient` (target driver)

`NodeSqlite.layer.ts`: `@effect/sql-sqlite-node`'s `SqliteClient.layer` with VidBee's settings
(file name, WAL, `foreign_keys = ON`, `busy_timeout`, number reads). Until the cutover it is used
only by this package's tests, which run every pinning assertion against three clients:
`better-sqlite3` directly (today's behavior), `BetterSqliteClient`, and `NodeSqliteClient`. That is
the standing proof that the cutover changes nothing at this layer. Importing it from the desktop
process before the cutover is the mistake section 2 forbids; `port:check` gets a rule for it.

### 4.4 `DbSchema` (migrations)

`Migrations.service.ts` / `Migrations.layer.ts`:

```ts
export class DbSchema extends Context.Service<DbSchema, {
  /** Create or upgrade the task-queue tables (TASK_QUEUE_DDL_V1). */
  readonly applyTaskQueue: Effect.Effect<void, DbMigrationError>
  readonly applySubscriptions: Effect.Effect<void, DbMigrationError>
  readonly applyTranscripts: Effect.Effect<void, DbMigrationError>
  readonly applyPromptRuns: Effect.Effect<void, DbMigrationError>
}>()("@vidbee/db/Migrations.service/DbSchema") {}
export const layer: Layer.Layer<DbSchema, never, SqlClient.SqlClient>
```

- Each method runs the same statements in the same order as the function it replaces. The DDL
  constants stay the single source of the SQL.
- The Effect versions read `pragma table_info` themselves. The old functions take the column list
  from the caller, and the pinning tests show that a stale list makes them fail; the legacy
  functions keep that exact behavior.
- The Drizzle journal migrations (`apps/desktop/resources/drizzle`, run by desktop's
  `database/migrate.ts`) are not part of this service. They stay with the unported desktop code
  until phase 9.0, which adds a method that runs `drizzle-orm/effect-sqlite-node/migrator`.

### 4.5 `Drizzle` (typed queries)

`Drizzle.service.ts`: a `Context.Service` holding the `drizzle-orm/effect-sqlite-node` database
built with `makeWithDefaults()` over the client in context, for ported consumers that query
through the table objects. It works over both clients of 4.2 and 4.3; the tests prove it by running
the round-trip pinning cases through it on each.

## 5. Legacy facade

The old API is synchronous and takes callbacks, so it needs no runtime:

| Legacy entry | Exports (unchanged signatures) | Used by |
| --- | --- | --- |
| `@vidbee/db/legacy/task-queue` | `TASK_QUEUE_DDL_V1` | desktop `task-queue-migrate.ts`, `task-queue-host.ts` |
| `@vidbee/db/legacy/transcripts` | `TRANSCRIPT_DDL_V1`, `applyTranscriptMigrations` | desktop hosts, `transcription/transcript-store.ts` |
| `@vidbee/db/legacy/subscriptions` | `applySubscriptionsMigrations`, the table objects and types `subscriptions-core/store.ts` imports | desktop `subscriptions-host.ts`, `subscriptions-core` |
| `@vidbee/db/legacy/prompt-runs` | `applyPromptRunMigrations` | desktop `ai-prompt-store.ts` |

The main entries keep their paths and export the tables, the row models, the DDL constants and
the Effect API. Table objects and DDL constants are plain data, valid in both worlds, so a consumer
that imports only those does not change. The exact import changes are listed in the phase report.

## 6. Drizzle 1.0.0-rc.5 (repo-wide, in this phase)

- Catalog: `drizzle-orm` and `drizzle-kit` to `1.0.0-rc.5`; the root `overrides` entry that holds
  `drizzle-orm` below 0.46 goes; add `@effect/sql-sqlite-node` at beep-effect's pin.
- `drizzle-kit up` rewrites `apps/desktop/resources/drizzle` into the 1.0 folder format. The three
  SQL files stay byte-identical, so their hashes, which the owner's database already records, do
  not change.
- The two `drizzle(handle)` calls become `drizzle({ client: handle })`. In 1.0 the old form opens a
  new in-memory database instead of failing, so this is checked by test, not only by the compiler.
- **What changes in an existing database:** on first launch the 1.0 migrator adds two columns,
  `name` and `applied_at`, to its own `__drizzle_migrations` table and fills `name`. It re-runs no
  migration; no application table, index or row changes (spike question 6).
- **Rollback.** Every installed phase keeps the previous build. The implementation must show that
  the previous build (Drizzle 0.45) starts cleanly on a database the new build has opened.
- **Known hazard, not fixed here:** `drizzle-kit generate` against the current snapshots proposes
  `DROP TABLE download_history` and an `ADD auto_download` that already exists. The snapshots have
  drifted from the schema since before the port (the old drizzle-kit proposes the same). Nothing
  runs `generate` automatically. It is recorded in `OWNER-REVIEW.md`.

## 7. Rules this design sets for later phases

1. A ported package takes `SqlClient` from context. Its legacy facade is the only place that turns
   a `better-sqlite3` handle into a layer, with `BetterSqliteClient.layerFromHandle`.
2. A synchronous legacy function may only run effects that stay synchronous on the adapter: SQL
   and pure work. No sleeping, no awaiting, no other service that yields, inside a transaction or
   anywhere in a `runSync` path.
3. One facade runtime per host handle, created when the host hands the handle over, disposed when
   the host closes it.
4. Rows read with raw SQL are decoded with the `…RowFromSql` schemas; a decode failure is a
   `DbRowDecodeError`, never a cast.

## 8. Verification the implementation owes

- The 35 pinning tests, ported to `@effect/vitest`, pass against all three clients without
  changing an assertion or a snapshot.
- Adapter-specific tests: runs under `runSync`; nested and host-owned transactions (commit and
  rollback at each level); error mapping; borrowed lifetime (handle still open after disposal).
- A packaged build passes the golden suite with zero golden changes.
- On a copy of the owner's database: the packaged build starts, runs no migration twice, leaves
  every application table's schema and row count unchanged, and adds only the two tracking
  columns. Then the previous installed build starts on that same copy.

## 9. Review

Recorded after the independent review: reviewer, findings, and how each was resolved.
