# Design: `@vidbee/db` (phase 3)

Status: reviewed, findings resolved (section 9). Design gate per plan decision D14 as amended on
2026-11-17: drafted by the orchestrator, reviewed by an independent session, then implemented.

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

- **One model per table, in the Drizzle property names**, plus a `…RowFromSql` schema that decodes
  the snake_case row raw SQL returns into the same class. Most existing queries are raw SQL, so
  both shapes are needed.
- **The model's type is the table's `$inferSelect`.** A compile-time check requires the two to be
  mutually assignable, so a column added to one and not the other fails `tsrs`. The models are
  written by hand: `drizzle-orm/effect-schema` adds safe-integer bounds the storage does not have.
- **Where the real schema is wider than the Drizzle object, the model follows the Drizzle object
  and says so.** The pinning tests list the cases: primary-key text columns declared without
  `NOT NULL` (`tasks.id`, `attempts.id`, `schema_meta.key`, `subscriptions_meta.key`,
  `transcripts.id`, `transcript_segments.id`, `transcript_speakers.id`) can physically hold NULL.
  No writer has ever stored one. A row with a NULL there fails to decode with `DbRowDecodeError`;
  it is not coerced. Each such column is listed in the model file with this note.
- **No refinement without a constraint.** An `INTEGER` column is `S.Number`: SQLite's integer
  affinity accepts and returns a real if one is written, so "only integers were seen" is not a
  reason for `S.Int`. Enumerated columns (`status`, `kind`, `type`) are unconstrained `text`, so
  here they are `S.String`; narrowing them to literal kits belongs to the package that owns the
  meaning, in its phase. `*_json` columns are `S.String`; their owners decode them with
  `S.fromJsonString(...)`.
- **Integers are read as JS numbers.** `node:sqlite` throws on an integer above 2^53 unless big-int
  reads are on and `better-sqlite3` silently rounds; no column holds such a value today (spike
  question 2). Both clients are configured for number reads.
- **Insert shapes follow `$inferInsert` exactly**: a column is optional on insert when it is
  nullable, has a default, or is generated (autoincrement); everything else is required. Checked
  against `$inferInsert` by the same mutual-assignability test, and by tests that omit nullable
  columns (not only pass `null`).
- **Query-shaped results get their own schemas, derived from the models.** Many queries return a
  projection (`SELECT id, feed_url`), a computed column (`tasks.*` plus `first_started_at`), an
  aggregate (`COUNT(*) AS n`) or an existence probe (`SELECT 1 AS present`). The consumer defines
  the schema next to the query: `pick` / `omit` on the model's fields for projections, the model's
  fields plus the computed column for extensions. The package exports the shared small ones
  (`CountRow`, `ExistsRow`, `IdRow`). A port never fetches extra columns to satisfy a decoder.

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

It is built from `effect/sql`'s public constructors (`SqlClient.make`,
`SqlClient.makeSqliteAcquirers`, `Statement.makeCompilerSqlite`, `SqlError` /
`classifySqliteError`) and provides `Reactivity` internally, as the standard node client does.

**Connection contract** (`SqlConnection`): `execute` returns object rows; `executeValues` returns
array rows; `executeRaw` returns the driver's run result as `{ changes, lastInsertRowid }`, the
shape `drizzle-orm/effect-sqlite-node` expects from `.run()`; `executeUnprepared` runs through
`handle.exec` / a one-off statement; `executeStream` is **not implemented** and dies with the same
message as the standard node client, so that no consumer can come to depend on streaming that the
target client lacks.

**Prepared statements.** One cache per handle, keyed by SQL text, bounded (same default size as the
node client). `better-sqlite3`'s `.raw(true)` changes a statement's return mode in place, so a
cached statement is put back in object mode in a `finally`, including after a failed call.

**Node tag.** The same client value is also provided as `@effect/sql-sqlite-node`'s `SqliteClient`
(its type id, `config`, `backup`, `loadExtension`), because `drizzle-orm/effect-sqlite-node` asks
for that tag. `backup` and `loadExtension` fail with a `SqlError`: the handle is borrowed.

**Borrowed lifetime.** It never opens, closes, checkpoints or reconfigures the handle. Pragmas
(WAL, `foreign_keys`, `busy_timeout`) are whatever the host set. Disposing the layer finalizes only
its cached statements.

**Synchronous.** Every statement runs with the handle's synchronous API; nothing in the client
yields to the event loop. Acquisition goes through a semaphore that a transaction holds for its
whole scope, so the guarantee holds as long as no fiber suspends while holding it; that is rule 2
of section 7. A second acquisition while the permit is held and the holder is suspended is a
programming error, and the client fails it with a defect that names the rule.

**Transactions.**

| Situation | Begin | Success | Failure |
| --- | --- | --- | --- |
| Depth 0, handle not in a transaction | `BEGIN IMMEDIATE` by default (the standard node client's default for a writable database); a consumer overrides it per operation with `SqlClient.BeginTransaction` | `COMMIT`; on a failed commit, `ROLLBACK` | `ROLLBACK` |
| Nested inside an Effect transaction | `SAVEPOINT effect_sql_<depth>` | `RELEASE` | `ROLLBACK TO` then `RELEASE` |
| Depth 0, but `handle.inTransaction` is already true (the host called in from its own `handle.transaction(...)`) | `SAVEPOINT vidbee_borrowed_<n>` (a counter, so nested re-entry cannot collide) | `RELEASE` | `ROLLBACK TO` then `RELEASE`; the host's transaction stays open and usable |

The third row keeps what `better-sqlite3` does today: its nested `transaction()` calls become
savepoints automatically. In that mode the adapter never issues `BEGIN`, `COMMIT` or `ROLLBACK`;
the host owns the real commit. Every ported operation states its begin mode; nothing relies on a
default staying the same across the two clients.

**Errors.** A driver failure becomes a `SqlError` whose cause is the original `SqliteError`
(same `code`, same `message`). Legacy facades use `rethrowDriverError` (section 5) to throw that
original object again.

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
the round-trip pinning cases through it on each, and by alternating object, values and raw calls on
the same SQL text (including a failed values call) to exercise the statement cache. Results of
Drizzle queries are decoded with the same models as raw rows.

## 5. Legacy facade

The old API is synchronous and takes callbacks, so it needs no runtime:

| Legacy entry | Exports (unchanged signatures) | Used by |
| --- | --- | --- |
| `@vidbee/db/legacy/task-queue` | `TASK_QUEUE_DDL_V1` | desktop `task-queue-migrate.ts`, `task-queue-host.ts` |
| `@vidbee/db/legacy/transcripts` | `TRANSCRIPT_DDL_V1`, `applyTranscriptMigrations` | desktop hosts, `transcription/transcript-store.ts` |
| `@vidbee/db/legacy/subscriptions` | `applySubscriptionsMigrations`, the table objects and types `subscriptions-core/store.ts` imports | desktop `subscriptions-host.ts`, `subscriptions-core` |
| `@vidbee/db/legacy/prompt-runs` | `applyPromptRunMigrations` | desktop `ai-prompt-store.ts` |

`@vidbee/db/legacy` also exports what the facades of later phases share:

```ts
/** The one runtime for a host handle. Every package facade given the same handle gets the same
 *  adapter, statement cache and semaphore. Created on first use. */
export const runtimeForHandle: (handle: BetterSqlite3.Database) => ManagedRuntime.ManagedRuntime<SqlClient.SqlClient | SqliteClient.SqliteClient, never>
/** Dispose that runtime. The host calls it before it closes the handle. */
export const releaseHandle: (handle: BetterSqlite3.Database) => void
/** If a failure's cause chain holds the driver's original error, throw that object; otherwise
 *  throw the failure. Keeps legacy callers seeing `SqliteError` with its `code` (assumption A6). */
export const rethrowDriverError: (cause: Cause.Cause<unknown>) => never
```

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
- **Rollback.** Every installed phase keeps the previous build, so a database the new build has
  opened must still open in the previous one (Drizzle 0.45). For an existing, fully migrated
  database this holds: 1.0 keeps the original tracking rows. For a **fresh** database it does not
  hold by default: 1.0 derives `created_at` from the folder name with second precision
  (`1763176841000`), while 0.45 decides what to apply by comparing against the journal's
  millisecond values (`1763176841336`), so the old build would re-run a migration and fail on a
  duplicate column. Desktop's `database/migrate.ts` already reconciles tracking rows after
  migrating; it gains one step: for each known migration hash, set `created_at` to the original
  millisecond value. 1.0 matches tracking rows by second-truncated timestamp with a hash
  fallback, so it keeps recognizing them. Tests cover existing, fresh and partially migrated
  databases in both directions (new then old, old then new).
- **Known hazard, not fixed here:** `drizzle-kit generate` against the current snapshots proposes
  `DROP TABLE download_history` and an `ADD auto_download` that already exists. The snapshots have
  drifted from the schema since before the port (the old drizzle-kit proposes the same). Nothing
  runs `generate` automatically. It is recorded in `OWNER-REVIEW.md`.

## 7. Rules this design sets for later phases

1. A ported package takes `SqlClient` from context. Its legacy facade is the only place that turns
   a `better-sqlite3` handle into a runtime, with `runtimeForHandle` from `@vidbee/db/legacy`.
2. Inside a transaction, and anywhere on a path a synchronous legacy function runs with
   `runSync`: SQL and pure work only. No sleeping, no awaiting, no service that yields.
3. Every transaction states its begin mode. Operations that are `handle.transaction(fn).immediate`
   today (task-queue, transcripts) use `BEGIN IMMEDIATE`; operations that use Drizzle's or
   `better-sqlite3`'s deferred default today (subscriptions) set `BEGIN` explicitly.
4. Rows are decoded with the models or with query-shaped schemas derived from them
   (section 3.2); a decode failure is a `DbRowDecodeError`, never a cast.
5. A legacy facade rethrows the driver's original error with `rethrowDriverError`.
6. No ported code uses `stream` on the client.
7. Every ported consumer runs its persistence tests against both clients (`BetterSqliteClient`
   and `NodeSqliteClient`), in separate test processes, so cutover readiness is checked in each
   phase and not discovered at the end.

## 8. Verification the implementation owes

- The pinning tests, ported to `@effect/vitest`, pass against three clients: `better-sqlite3`
  directly, `BetterSqliteClient`, `NodeSqliteClient`. Application-schema and row-value assertions
  and their snapshots do not change. The 0.45 migration folder is kept as an immutable test fixture
  (`packages/db/test/fixtures/drizzle-0.45/`) and remains the baseline. Only these metadata
  expectations get a second, 1.0 variant: the migration folder layout, and the
  `__drizzle_migrations` table definition (`id` type, added `name` and `applied_at`).
- Adapter tests: `runSync`; begin modes; nested and borrowed transactions, including an inner
  failure the host catches followed by a successful outer commit; statement-cache mode reset;
  error mapping and `rethrowDriverError`; borrowed lifetime (handle open after disposal);
  `runtimeForHandle` returns one runtime per handle.
- Rollback matrix of section 6 as tests, running both Drizzle versions' migrators.
- A packaged build passes the golden suite with zero golden changes.
- On a copy of the owner's database, migration only (no app launch): canonical content checksums
  of every application table, the migration hashes and timestamps, `integrity_check`,
  `foreign_key_check` and the pragmas are identical before and after, apart from the two added
  tracking columns. Then the same after the previous build's migrator runs on that copy.
- On another copy: the packaged build launches offline and the previous installed build launches
  on the result.

## 9. Review

Reviewer: an independent session on the review-panel tier (GPT-6 Astra, highest effort), read-only,
2026-11-18. It read the plan, the port guide, the spike, this draft, the package and its consumers,
and the installed Effect 4.1.4, Drizzle 0.45.4 and Drizzle 1.0.0-rc.5 sources, and ran in-memory
probes. No blocker. Findings and resolutions:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | major | Rollback fails for a fresh database created by Drizzle 1.0: second-precision `created_at` makes the 0.45 migrator re-run a migration (reproduced). | Section 6: the forward build writes the original millisecond values; rollback tested for existing, fresh and partial databases. |
| 2 | major | `BEGIN` versus today's `.immediate` changes locking; the two clients have different defaults; adopting a host transaction needs more than swapping `BEGIN` for a savepoint. | Section 4.2 transaction table; rule 3 of section 7. |
| 3 | major | "No narrower than the database" contradicts mutual assignability with `$inferSelect` where the DDL is wider (nullable primary keys), and `S.Int` cannot be justified by samples. | Section 3.2: the model follows the Drizzle type and the rejected stored values are named; `S.Int` rule removed; models written by hand. |
| 4 | major | Full-row decoders cannot decode projections, computed columns and aggregates that consumers select today. | Section 3.2, query-shaped schemas; rule 4. |
| 5 | major | "Columns with defaults are optional" misses nullable columns, which Drizzle inserts also allow omitting. | Section 3.2, insert shapes follow `$inferInsert`. |
| 6 | minor | "No assertion or snapshot changes" conflicts with the migration-folder upgrade the same phase makes. | Section 8: old folder kept as fixture; the two metadata expectations that get a 1.0 variant are named. |
| 7 | minor | Row counts do not prove content was preserved. | Section 8: content checksums, hashes, integrity and foreign-key checks, migration-only run. |
| 8 | question | Exact adapter interface: connection methods, `.raw` mode on cached statements, the node tag's members, `Reactivity`. | Section 4.2 connection contract, prepared statements, node tag. |
| 9 | question | What keeps later facades synchronous and error-compatible, and how is cutover risk found early? | Section 4.2 (contended acquisition is a defect), section 5 (`runtimeForHandle`, `rethrowDriverError`), rules 5 to 7; `executeStream` left unimplemented on purpose. |

The reviewer found sound: the transitional reading of D30, borrowing the host's handle, leaving
enum and JSON meaning to the owning packages, and keeping the legacy appliers synchronous.
